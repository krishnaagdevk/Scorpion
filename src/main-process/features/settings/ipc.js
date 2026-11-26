const { ensureOpenCodeReady, resolveOpenCodeCommand } = require('../../../services/ai/opencode-installer');
const fs = require('fs');

function registerSettingsIpc({
  ipcMain,
  app,
  getAppEnvironment,
  setAppEnvironment,
  getAppState,
  setAppState,
  getAppStatePath,
  saveApplicationEnvironment,
  saveAppState,
  geminiRuntime,
  windowController,
  getAssemblyAiSpeechModel,
  setAssemblyAiSpeechModel,
  keyboardShortcuts,
  assemblyAiSpeechModels,
  defaultAssemblyAiSpeechModel,
  sendToRenderer
}) {
  ipcMain.handle('get-settings', () => {
    const appEnvironment = getAppEnvironment();
    const appState = getAppState();
    const geminiApiKey = typeof appState?.geminiApiKey === 'string' ? appState.geminiApiKey : '';
    const assemblyAiApiKey = typeof appState?.assemblyAiApiKey === 'string' ? appState.assemblyAiApiKey : '';

    // Trigger non-blocking background refresh if caches are still empty (never block renderer startup)
    if ((geminiRuntime.getAntigravityModelEntries?.() || []).length === 0) {
      geminiRuntime.refreshAntigravityModels?.().catch(() => {});
    }

    const resolvedOcCmd = resolveOpenCodeCommand();
    const opencodeInstalled = resolvedOcCmd !== 'opencode' && fs.existsSync(resolvedOcCmd);
    if (opencodeInstalled && (geminiRuntime.getOpenCodeModelEntries?.() || []).length === 0) {
      geminiRuntime.refreshOpenCodeModels?.().catch(() => {});
    }

    return {
      aiProvider: geminiRuntime.getActiveAiProvider(),
      geminiApiKey,
      assemblyAiApiKey,
      hasGeminiApiKeys: geminiApiKey.split(',').map((value) => value.trim()).filter(Boolean).length > 0,
      hasAssemblyAiApiKey: assemblyAiApiKey.length > 0,
      geminiModel: geminiRuntime.getActiveGeminiModel(),
      geminiModels: geminiRuntime.getGeminiModels(),
      defaultGeminiModel: geminiRuntime.getDefaultGeminiModel(),
      antigravityModel: geminiRuntime.getActiveAntigravityModel?.() || '',
      antigravityModels: geminiRuntime.getAntigravityModels?.() || [],
      antigravityModelEntries: geminiRuntime.getAntigravityModelEntries?.() || [],
      defaultAntigravityModel: geminiRuntime.getDefaultAntigravityModel?.() || '',
      opencodeModel: geminiRuntime.getActiveOpenCodeModel?.() || '',
      opencodeModels: geminiRuntime.getOpenCodeModels?.() || [],
      opencodeModelEntries: geminiRuntime.getOpenCodeModelEntries?.() || [],
      freeOpenCodeModels: geminiRuntime.getFreeOpenCodeModels?.() || [],
      defaultOpenCodeModel: geminiRuntime.getDefaultOpenCodeModel?.() || '',
      opencodeInstalled,
      ollamaBaseUrl: geminiRuntime.getActiveOllamaBaseUrl(),
      ollamaModel: geminiRuntime.getActiveOllamaModel(),
      defaultOllamaBaseUrl: geminiRuntime.getDefaultOllamaBaseUrl(),
      defaultOllamaModel: geminiRuntime.getDefaultOllamaModel(),
      cliAgentType: geminiRuntime.getActiveCliAgentType?.() || 'codex',
      cliAgentCmd: geminiRuntime.getActiveCliAgentCmd?.() || '',
      cliAgentTypes: geminiRuntime.getCliAgentTypes?.() || ['codex', 'claude-code', 'custom'],
      programmingLanguage: geminiRuntime.getActiveProgrammingLanguage(),
      programmingLanguages: geminiRuntime.getProgrammingLanguages(),
      defaultProgrammingLanguage: geminiRuntime.getDefaultProgrammingLanguage(),
      assemblyAiSpeechModels,
      defaultAssemblyAiSpeechModel,
      assemblyAiSpeechModel: getAssemblyAiSpeechModel(),
      keyboardShortcuts,
      hideFromScreenCapture: appEnvironment.hideFromScreenCapture,
      startHidden: appEnvironment.startHidden,
      windowOpacityLevel: windowController.getWindowOpacityLevel(),
      candidateResume: appState?.candidateResume || '',
      jobDescription: appState?.jobDescription || '',
      autoCopilotEnabled: Boolean(appState?.autoCopilotEnabled),
      oaModeEnabled: Boolean(appState?.oaModeEnabled),
      hasCompletedInitialChecks: Boolean(appState?.hasCompletedInitialChecks),
      themePreference: appState?.themePreference === 'dark' || appState?.themePreference === 'light'
        ? appState.themePreference
        : null
    };
  });

  ipcMain.handle('set-theme-preference', (_event, payload = {}) => {
    try {
      const requestedTheme = typeof payload === 'string'
        ? payload
        : payload?.theme;
      const normalizedTheme = String(requestedTheme || '').trim().toLowerCase();
      const themePreference = normalizedTheme === 'dark' ? 'dark' : 'light';

      const updatedAppState = saveAppState(app, { themePreference });
      setAppState(updatedAppState);

      return { success: true, themePreference };
    } catch (error) {
      console.error('Error saving theme preference:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('refresh-antigravity-models', async () => {
    try {
      const result = await geminiRuntime.refreshAntigravityModels?.();
      return { success: true, ...(result || {}) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ensure-opencode-ready', async () => {
    try {
      const result = await ensureOpenCodeReady({
        onProgress: (status) => {
          if (typeof sendToRenderer === 'function') {
            sendToRenderer('opencode-setup-status', status);
          }
        },
        syncModelsFn: () => geminiRuntime.refreshOpenCodeModels?.()
      });

      const activeModel = geminiRuntime.getActiveOpenCodeModel?.() || geminiRuntime.getDefaultOpenCodeModel?.() || '';
      if (result.success && activeModel) {
        const currentAppState = getAppState?.() || {};
        if (!currentAppState.opencodeModel) {
          const updated = saveAppState(app, { opencodeModel: activeModel });
          setAppState(updated);
        }
        if (geminiRuntime.getActiveAiProvider() === 'opencode') {
          geminiRuntime.initializeOpenCodeService(geminiRuntime.getActiveProgrammingLanguage(), activeModel);
        }
      }

      return {
        ...result,
        entries: geminiRuntime.getOpenCodeModelEntries?.() || [],
        freeModels: geminiRuntime.getFreeOpenCodeModels?.() || [],
        defaultModel: geminiRuntime.getDefaultOpenCodeModel?.() || '',
        activeModel
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('save-settings', async (_event, settings = {}) => {
    console.log('IPC: save-settings called');

    try {
      const appEnvironment = getAppEnvironment();
      const currentAppState = getAppState?.() || {};
      const nextAiProvider = geminiRuntime.setActiveAiProvider(settings.aiProvider);
      const nextGeminiApiKey = String(settings.geminiApiKey || '').trim();
      const nextAssemblyAiApiKey = String(settings.assemblyAiApiKey || '').trim();
      const nextGeminiModel = geminiRuntime.setActiveGeminiModel(settings.geminiModel);
      const nextAntigravityModel = geminiRuntime.setActiveAntigravityModel?.(settings.antigravityModel);
      const nextOpenCodeModel = geminiRuntime.setActiveOpenCodeModel?.(settings.opencodeModel);
      const nextOllamaBaseUrl = geminiRuntime.setActiveOllamaBaseUrl(settings.ollamaBaseUrl);
      const nextOllamaModel = geminiRuntime.setActiveOllamaModel(settings.ollamaModel);
      const nextCliAgentType = geminiRuntime.setActiveCliAgentType?.(settings.cliAgentType) || 'codex';
      const nextCliAgentCmd = geminiRuntime.setActiveCliAgentCmd?.(settings.cliAgentCmd) || '';
      const nextAssemblyModel = setAssemblyAiSpeechModel(settings.assemblyAiSpeechModel);
      const nextProgrammingLanguage = geminiRuntime.setActiveProgrammingLanguage(settings.programmingLanguage);
      const nextWindowOpacityLevel = windowController.setWindowOpacityLevel(settings.windowOpacityLevel);

      const updatedEnvironment = saveApplicationEnvironment(app, {
        hideFromScreenCapture: appEnvironment.hideFromScreenCapture,
        startHidden: appEnvironment.startHidden,
        maxScreenshots: appEnvironment.maxScreenshots,
        screenshotDelay: appEnvironment.screenshotDelay,
        nodeEnv: appEnvironment.nodeEnv,
        nodeOptions: appEnvironment.nodeOptions
      });

      const keyState = geminiRuntime.setKeys(nextGeminiApiKey, 0);
      const updatedAppState = saveAppState(app, {
        aiProvider: nextAiProvider,
        geminiApiKey: nextGeminiApiKey,
        assemblyAiApiKey: nextAssemblyAiApiKey,
        geminiApiKeyIndex: keyState.activeApiKeyIndex,
        geminiModel: nextGeminiModel,
        antigravityModel: nextAntigravityModel,
        opencodeModel: nextOpenCodeModel,
        ollamaBaseUrl: nextOllamaBaseUrl,
        ollamaModel: nextOllamaModel,
        cliAgentType: nextCliAgentType,
        cliAgentCmd: nextCliAgentCmd,
        assemblyAiSpeechModel: nextAssemblyModel,
        programmingLanguage: nextProgrammingLanguage,
        windowOpacityLevel: nextWindowOpacityLevel,
        candidateResume: typeof settings.candidateResume === 'string' ? settings.candidateResume.trim() : (currentAppState?.candidateResume || ''),
        jobDescription: typeof settings.jobDescription === 'string' ? settings.jobDescription.trim() : (currentAppState?.jobDescription || ''),
        autoCopilotEnabled: typeof settings.autoCopilotEnabled === 'boolean' ? settings.autoCopilotEnabled : Boolean(currentAppState?.autoCopilotEnabled),
        oaModeEnabled: typeof settings.oaModeEnabled === 'boolean' ? settings.oaModeEnabled : Boolean(currentAppState?.oaModeEnabled)
      });

      setAppEnvironment(updatedEnvironment);
      setAppState(updatedAppState);

      console.log('Saved app state to:', getAppStatePath(app));
      console.log('Settings saved to:', updatedEnvironment.envPath);
      console.log('Applied AI provider:', nextAiProvider);
      console.log('Applied programming language:', nextProgrammingLanguage);
      console.log(`Applied window opacity level: ${nextWindowOpacityLevel}/10`);

      if (nextAiProvider === 'ollama') {
        console.log(`Applied Ollama model: ${nextOllamaModel} at ${nextOllamaBaseUrl}`);
        geminiRuntime.initializeOllamaService(
          nextOllamaBaseUrl,
          nextOllamaModel,
          nextProgrammingLanguage
        );
      } else if (nextAiProvider === 'antigravity') {
        console.log(`Applied Antigravity AI provider (model: ${nextAntigravityModel})`);
        geminiRuntime.initializeAntigravityService(nextProgrammingLanguage, nextAntigravityModel);
      } else if (nextAiProvider === 'opencode') {
        console.log(`Applied OpenCode AI provider (model: ${nextOpenCodeModel || 'auto'})`);
        geminiRuntime.initializeOpenCodeService(nextProgrammingLanguage, nextOpenCodeModel);
        ensureOpenCodeReady({
          onProgress: (status) => {
            if (typeof sendToRenderer === 'function') {
              sendToRenderer('opencode-setup-status', status);
            }
          },
          syncModelsFn: () => geminiRuntime.refreshOpenCodeModels?.()
        }).then((readyRes) => {
          if (readyRes?.success) {
            const resolvedModel = geminiRuntime.getActiveOpenCodeModel?.() || geminiRuntime.getDefaultOpenCodeModel?.();
            if (resolvedModel) {
              geminiRuntime.initializeOpenCodeService(nextProgrammingLanguage, resolvedModel);
            }
          }
        }).catch(() => {});
      } else if (nextAiProvider === 'codex' || nextAiProvider === 'claude-code') {
        console.log(`Applied CLI agent provider: ${nextCliAgentType}`);
        geminiRuntime.initializeCliAgentService(
          nextCliAgentType || nextAiProvider,
          nextCliAgentCmd,
          nextProgrammingLanguage
        );
      } else {
        console.log(`Applied Gemini API key index: ${keyState.activeApiKeyIndex + 1}/${keyState.geminiApiKeys.length}`);
        geminiRuntime.initializeGeminiService(
          keyState.activeApiKey,
          nextGeminiModel,
          nextProgrammingLanguage
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Error saving settings:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerSettingsIpc
};
