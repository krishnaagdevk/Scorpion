const {
  app,
  dialog,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  screen
} = require('electron');
const WebSocket = require('ws');

const {
  loadApplicationEnvironment,
  normalizeGeminiApiKeys,
  saveApplicationEnvironment
} = require('../bootstrap/environment');
const {
  getAssemblyAiSpeechModels,
  getDefaultAssemblyAiSpeechModel,
  getKeyboardShortcuts,
  resolveAssemblyAiSpeechModel
} = require('../config');
const {
  getAppStatePath,
  loadAppState,
  saveAppState
} = require('../services/state/app-state');
const { createAssistantWindow } = require('../windows/assistant/window');
const { createSafeSender } = require('./shared/safe-send');
const { createGeminiRuntime } = require('./features/assistant/gemini-runtime');
const { createScreenshotManager } = require('./features/assistant/screenshot-manager');
const { registerAssistantIpc } = require('./features/assistant/ipc');
const { createAssemblyAiService } = require('../services/assembly-ai/service');
const { createOcrService } = require('../services/ocr/service');
const { registerAssemblyAiIpc } = require('../services/assembly-ai/ipc');
const { registerSettingsIpc } = require('./features/settings/ipc');
const { createWindowController } = require('./features/window/window-controller');
const { DEFAULT_WINDOW_OPACITY_LEVEL } = require('./features/window/window-constants');
const { logStartupConfiguration } = require('./startup-logging');
const { createMobileServer } = require('./features/mobile-server/server');
const { createQaManager } = require('./features/qa-history/qa-manager');
const { runAllReadinessChecks } = require('../services/system/system-readiness');
const { ensureOpenCodeReady } = require('../services/ai/opencode-installer');

function resolveStartupOptions(argv = process.argv) {
  const normalizedArgs = Array.isArray(argv)
    ? argv.map((value) => String(value || '').trim().toLowerCase())
    : [];

  const hasFlag = (flag) => normalizedArgs.includes(flag);

  return {
    startHidden: hasFlag('--start-hidden') || hasFlag('--background')
  };
}

async function startApplication() {
  let appEnvironment = null;
  let appState = null;
  let isShuttingDown = false;
  const startupOptions = resolveStartupOptions();

  const geminiRuntime = createGeminiRuntime();

  const assemblyAiSpeechModels = getAssemblyAiSpeechModels();
  const defaultAssemblyAiSpeechModel = getDefaultAssemblyAiSpeechModel();
  const keyboardShortcuts = getKeyboardShortcuts();
  let activeAssemblyAiSpeechModel = defaultAssemblyAiSpeechModel;

  let screenshotManager = null;
  let windowController = null;
  const ocrService = createOcrService();

  const baseSendToRenderer = createSafeSender(() => {
    if (!windowController) {
      return null;
    }

    return windowController.getMainWindow();
  });

  // Mobile server reports its own status (listening, URLs, client count) to
  // the desktop renderer via the un-augmented sender — we don't want it
  // bouncing back to mobile clients.
  const mobileServer = createMobileServer({
    getGeminiRuntime:    () => geminiRuntime,
    getScreenshotManager: () => screenshotManager,
    notifyDesktop:        baseSendToRenderer
  });

  // Augmented sender: events flow to both the Electron renderer and all
  // connected mobile WebSocket clients simultaneously.
  const sendToRenderer = (channel, data) => {
    baseSendToRenderer(channel, data);
    mobileServer.broadcast(channel, data);
  };

  const assemblyAiService = createAssemblyAiService({
    WebSocket,
    desktopCapturer,
    getAssemblyApiKey: () => appState?.assemblyAiApiKey || '',
    getSpeechModel: () => activeAssemblyAiSpeechModel,
    getGeminiService: () => geminiRuntime.getService(),
    sendToRenderer
  });

  const qaManager = createQaManager({
    app,
    screen,
    getAppEnvironment: () => appEnvironment,
    getInitialOpacity: () => (windowController ? windowController.getCurrentWindowOpacity() : 1),
    getInitialClickThrough: () => (windowController ? windowController.isClickThroughEnabled() : false)
  });

  windowController = createWindowController({
    app,
    screen,
    globalShortcut,
    createAssistantWindow,
    getAppEnvironment: () => appEnvironment,
    emitSttDebug: assemblyAiService.emitSttDebug,
    sendToRenderer,
    onTakeStealthScreenshot: async () => {
      if (screenshotManager) {
        await screenshotManager.takeStealthScreenshot();
      }
    },
    onToggleQaWindow: () => {
      qaManager.toggleQaWindow();
    },
    getSecondaryWindows: () => [qaManager?.getQaWindow()].filter(Boolean)
  });

  screenshotManager = createScreenshotManager({
    app,
    getMainWindow: () => windowController.getMainWindow(),
    getAppEnvironment: () => appEnvironment,
    sendToRenderer
  });

  function loadPersistedAppState() {
    appState = loadAppState(app);

    const activeAiProvider = geminiRuntime.setActiveAiProvider(appState.aiProvider);
    const keyState = geminiRuntime.setKeys(
      normalizeGeminiApiKeys(appState?.geminiApiKey),
      appState.geminiApiKeyIndex
    );
    const activeGeminiModel = geminiRuntime.setActiveGeminiModel(appState.geminiModel);
    const activeAntigravityModel = geminiRuntime.setActiveAntigravityModel?.(appState.antigravityModel);
    const activeOpenCodeModel = geminiRuntime.setActiveOpenCodeModel?.(appState.opencodeModel);
    const activeOllamaBaseUrl = geminiRuntime.setActiveOllamaBaseUrl(appState.ollamaBaseUrl);
    const activeOllamaModel = geminiRuntime.setActiveOllamaModel(appState.ollamaModel);
    const activeCliAgentType = geminiRuntime.setActiveCliAgentType?.(appState.cliAgentType) || 'codex';
    const activeCliAgentCmd = geminiRuntime.setActiveCliAgentCmd?.(appState.cliAgentCmd) || '';
    activeAssemblyAiSpeechModel = resolveAssemblyAiSpeechModel(appState.assemblyAiSpeechModel);
    const activeProgrammingLanguage = geminiRuntime.setActiveProgrammingLanguage(appState.programmingLanguage);
    const activeWindowOpacityLevel = windowController.setWindowOpacityLevel(appState.windowOpacityLevel);

    if (
      appState.aiProvider !== activeAiProvider ||
      appState.geminiApiKeyIndex !== keyState.activeApiKeyIndex ||
      appState.geminiModel !== activeGeminiModel ||
      appState.antigravityModel !== activeAntigravityModel ||
      appState.opencodeModel !== activeOpenCodeModel ||
      appState.ollamaBaseUrl !== activeOllamaBaseUrl ||
      appState.ollamaModel !== activeOllamaModel ||
      appState.cliAgentType !== activeCliAgentType ||
      appState.cliAgentCmd !== activeCliAgentCmd ||
      appState.assemblyAiSpeechModel !== activeAssemblyAiSpeechModel ||
      appState.programmingLanguage !== activeProgrammingLanguage ||
      appState.windowOpacityLevel !== activeWindowOpacityLevel
    ) {
      appState = saveAppState(app, {
        aiProvider: activeAiProvider,
        geminiApiKeyIndex: keyState.activeApiKeyIndex,
        geminiModel: activeGeminiModel,
        antigravityModel: activeAntigravityModel,
        opencodeModel: activeOpenCodeModel,
        ollamaBaseUrl: activeOllamaBaseUrl,
        ollamaModel: activeOllamaModel,
        cliAgentType: activeCliAgentType,
        cliAgentCmd: activeCliAgentCmd,
        assemblyAiSpeechModel: activeAssemblyAiSpeechModel,
        programmingLanguage: activeProgrammingLanguage,
        windowOpacityLevel: activeWindowOpacityLevel
      });
    }

    console.log('Loaded app state from:', getAppStatePath(app));
    console.log('Restored AI provider from app state:', activeAiProvider);
    console.log(`Restored Gemini API key index from app state: ${keyState.activeApiKeyIndex + 1}/${keyState.geminiApiKeys.length}`);
    console.log('Restored Gemini model from app state:', activeGeminiModel);
    console.log('Restored Ollama config from app state:', activeOllamaModel, 'at', activeOllamaBaseUrl);
    console.log('Restored AssemblyAI speech model from app state:', activeAssemblyAiSpeechModel);
    console.log('Restored programming language from app state:', activeProgrammingLanguage);
    console.log(`Restored window opacity level from app state: ${activeWindowOpacityLevel}/10`);
  }

  function cleanupTransientResources() {
    qaManager.closeQaWindow();
    assemblyAiService.dispose();
    screenshotManager.cleanupTransientResources();
    ocrService.dispose().catch((error) => {
      console.error('Failed to dispose OCR worker:', error);
    });
    windowController.unregisterShortcuts();
    mobileServer.close();
  }

  function quitApplication() {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    cleanupTransientResources();
    windowController.destroyWindow();

    setTimeout(() => {
      app.exit(0);
    }, 50);
  }

  ipcMain.handle('mobile-server-get-status', () => mobileServer.getStatus());

  qaManager.registerIpc(ipcMain);
  qaManager.ensureQaWindowCreated();

  ipcMain.handle('run-system-readiness-checks', async () => {
    return runAllReadinessChecks(app, appState);
  });

  ipcMain.handle('mark-system-checks-completed', () => {
    appState = saveAppState(app, { hasCompletedInitialChecks: true });
    return { success: true };
  });

  registerAssistantIpc({
    ipcMain,
    screenshotManager,
    ocrService,
    windowController,
    geminiRuntime,
    assemblyAiService,
    sendToRenderer,
    quitApplication,
    getAppState: () => appState,
    qaManager
  });

  registerAssemblyAiIpc({
    ipcMain,
    assemblyAiService
  });

  registerSettingsIpc({
    ipcMain,
    app,
    getAppEnvironment: () => appEnvironment,
    setAppEnvironment: (nextEnvironment) => {
      appEnvironment = nextEnvironment;
    },
    getAppState: () => appState,
    setAppState: (nextAppState) => {
      appState = nextAppState;
    },
    getAppStatePath,
    saveApplicationEnvironment,
    saveAppState,
    geminiRuntime,
    windowController,
    getAssemblyAiSpeechModel: () => activeAssemblyAiSpeechModel,
    setAssemblyAiSpeechModel: (nextModel) => {
      activeAssemblyAiSpeechModel = resolveAssemblyAiSpeechModel(nextModel, activeAssemblyAiSpeechModel);
      return activeAssemblyAiSpeechModel;
    },
    keyboardShortcuts,
    assemblyAiSpeechModels,
    defaultAssemblyAiSpeechModel,
    sendToRenderer
  });

  app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder');
  app.commandLine.appendSwitch('ignore-certificate-errors');
  app.commandLine.appendSwitch('allow-running-insecure-content');
  app.commandLine.appendSwitch('disable-web-security');
  app.commandLine.appendSwitch('enable-media-stream');

  // Lightweight resource & low-footprint flags:
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-component-update');
  app.commandLine.appendSwitch('disable-domain-reliability');
  app.commandLine.appendSwitch('disable-breakpad');
  app.commandLine.appendSwitch('disable-sync');
  app.commandLine.appendSwitch('disable-speech-api');

  app.whenReady().then(() => {
    try {
      appEnvironment = loadApplicationEnvironment(app);
    } catch (error) {
      console.error('Failed to load application environment:', error);
      dialog.showErrorBox('Open-Cluely Configuration Error', error.message);
      app.exit(1);
      return;
    }

    loadPersistedAppState();

    logStartupConfiguration({
      appEnvironment,
      appState,
      geminiModels: geminiRuntime.getGeminiModels(),
      defaultGeminiModel: geminiRuntime.getDefaultGeminiModel(),
      assemblyAiSpeechModels,
      defaultAssemblyAiSpeechModel,
      programmingLanguages: geminiRuntime.getProgrammingLanguages(),
      defaultProgrammingLanguage: geminiRuntime.getDefaultProgrammingLanguage()
    });

    geminiRuntime.setActiveKeyIndexChangeHandler((nextIndex) => {
      if (!appState || appState.geminiApiKeyIndex === nextIndex) {
        return;
      }

      appState = saveAppState(app, { geminiApiKeyIndex: nextIndex });
      console.log(`Persisted Gemini API key index: ${nextIndex + 1}/${geminiRuntime.getApiKeys().length}`);
    });

    const activeProvider = geminiRuntime.getActiveAiProvider();
    if (activeProvider === 'ollama') {
      geminiRuntime.initializeOllamaService(
        geminiRuntime.getActiveOllamaBaseUrl(),
        geminiRuntime.getActiveOllamaModel(),
        geminiRuntime.getActiveProgrammingLanguage()
      );
    } else if (activeProvider === 'antigravity') {
      geminiRuntime.initializeAntigravityService(
        geminiRuntime.getActiveProgrammingLanguage(),
        geminiRuntime.getActiveAntigravityModel?.()
      );
    } else if (activeProvider === 'opencode') {
      geminiRuntime.initializeOpenCodeService(
        geminiRuntime.getActiveProgrammingLanguage(),
        geminiRuntime.getActiveOpenCodeModel?.()
      );
    } else if (activeProvider === 'codex' || activeProvider === 'claude-code') {
      geminiRuntime.initializeCliAgentService(
        geminiRuntime.getActiveCliAgentType() || activeProvider,
        geminiRuntime.getActiveCliAgentCmd(),
        geminiRuntime.getActiveProgrammingLanguage()
      );
    } else {
      geminiRuntime.initializeGeminiService(
        geminiRuntime.getActiveApiKey(),
        geminiRuntime.getActiveGeminiModel(),
        geminiRuntime.getActiveProgrammingLanguage()
      );
    }

    const launchHidden = startupOptions.startHidden || appEnvironment.startHidden;
    console.log('App is ready, creating window...');
    console.log(`Startup mode: ${launchHidden ? 'hidden' : 'visible'}`);
    windowController.createWindow({ launchHidden });
    windowController.registerShortcuts();

    if (!launchHidden) {
      windowController.markVisible();
    }

    if (appState?.windowOpacityLevel == null) {
      windowController.setWindowOpacityLevel(DEFAULT_WINDOW_OPACITY_LEVEL);
    }

    console.log(`Window setup complete (${launchHidden ? 'hidden launch' : 'visible launch'})`);

    // Background model discovery & OpenCode auto-install/setup (non-blocking)
    geminiRuntime.refreshAntigravityModels?.().then((agRes) => {
      if (agRes?.activeModel && appState && !appState.antigravityModel) {
        appState = saveAppState(app, { antigravityModel: agRes.activeModel });
      }
    }).catch((err) => {
      console.warn('[Startup] Antigravity model discovery notice:', err.message);
    });

    ensureOpenCodeReady({
      onProgress: (status) => sendToRenderer('opencode-setup-status', status),
      syncModelsFn: () => geminiRuntime.refreshOpenCodeModels?.()
    }).then((ocRes) => {
      if (ocRes?.success) {
        const resolvedModel = geminiRuntime.getActiveOpenCodeModel?.() || geminiRuntime.getDefaultOpenCodeModel?.();
        if (resolvedModel && appState && !appState.opencodeModel) {
          appState = saveAppState(app, { opencodeModel: resolvedModel });
        }
        if (geminiRuntime.getActiveAiProvider() === 'opencode' && resolvedModel) {
          geminiRuntime.initializeOpenCodeService(geminiRuntime.getActiveProgrammingLanguage(), resolvedModel);
        }
      }
    }).catch((err) => {
      console.warn('[Startup] OpenCode auto-setup notice:', err.message);
    });
  });

  app.on('window-all-closed', () => {
    // Keep running in background for stealth operation
  });

  app.on('activate', () => {
    if (!windowController.hasWindow()) {
      windowController.createWindow();
      windowController.markVisible();
    }
  });

  app.on('will-quit', () => {
    cleanupTransientResources();
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.on('new-window', (event) => {
      event.preventDefault();
    });

    contents.on('will-navigate', (event, navigationUrl) => {
      const mainWindow = windowController.getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }

      if (navigationUrl !== mainWindow.webContents.getURL()) {
        event.preventDefault();
      }
    });
  });

  process.title = 'SystemIdleProcess';
}

module.exports = {
  startApplication
};
