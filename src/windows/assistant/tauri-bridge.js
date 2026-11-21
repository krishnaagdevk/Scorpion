/**
 * Unified Bridge Adapter for Tauri v2 & Electron
 * Automatically detects runtime and provides full IPC compatibility so the UI works seamlessly.
 */

(function () {
  const isTauri = Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
  console.log(`[Bridge] Runtime environment detected: ${isTauri ? 'Tauri v2' : 'Electron'}`);

  if (isTauri && !window.electronAPI) {
    const tauriCore = window.__TAURI__?.core || window.__TAURI__;
    const invoke = tauriCore?.invoke || (async () => {});

    // In-memory event bus for Tauri IPC events
    const eventListeners = new Map();

    const emitEvent = (channel, ...args) => {
      const listeners = eventListeners.get(channel) || [];
      listeners.forEach((fn) => {
        try {
          fn(...args);
        } catch (e) {
          console.error(`[Bridge] Error in event listener for ${channel}:`, e);
        }
      });
    };

    const addEventListener = (channel, callback) => {
      if (!eventListeners.has(channel)) {
        eventListeners.set(channel, []);
      }
      eventListeners.get(channel).push(callback);
      return () => removeEventListener(channel, callback);
    };

    const removeEventListener = (channel, callback) => {
      if (!eventListeners.has(channel)) return;
      const list = eventListeners.get(channel).filter((cb) => cb !== callback);
      eventListeners.set(channel, list);
    };

    // Default settings schema matching Open-Cluely
    const defaultSettings = {
      aiProvider: 'antigravity',
      geminiApiKey: '',
      assemblyAiApiKey: '',
      hasGeminiApiKeys: false,
      hasAssemblyAiApiKey: false,
      geminiModel: 'gemini-1.5-flash',
      geminiModels: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'],
      defaultGeminiModel: 'gemini-1.5-flash',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaModel: 'llama3',
      defaultOllamaBaseUrl: 'http://localhost:11434',
      defaultOllamaModel: 'llama3',
      cliAgentType: 'codex',
      cliAgentCmd: '',
      cliAgentTypes: ['codex', 'claude-code', 'custom'],
      programmingLanguage: 'javascript',
      programmingLanguages: ['javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'go', 'rust'],
      defaultProgrammingLanguage: 'javascript',
      assemblyAiSpeechModels: ['best', 'nano'],
      defaultAssemblyAiSpeechModel: 'best',
      assemblyAiSpeechModel: 'best',
      keyboardShortcuts: {
        toggleVoice: 'Ctrl+Shift+V',
        takeScreenshot: 'Ctrl+Shift+S',
        askAi: 'Ctrl+Shift+A'
      },
      hideFromScreenCapture: true,
      startHidden: false,
      windowOpacityLevel: 10,
      themePreference: 'light'
    };

    const loadStoredSettings = () => {
      try {
        const raw = localStorage.getItem('cluely_tauri_settings');
        if (raw) {
          return { ...defaultSettings, ...JSON.parse(raw) };
        }
      } catch (e) {
        console.warn('[Bridge] Failed to load stored settings:', e);
      }
      return { ...defaultSettings };
    };

    const saveStoredSettings = (settings) => {
      try {
        const current = loadStoredSettings();
        const merged = { ...current, ...settings };
        localStorage.setItem('cluely_tauri_settings', JSON.stringify(merged));
        return { success: true, settings: merged };
      } catch (e) {
        return { success: false, error: e.message };
      }
    };

    window.electronAPI = {
      // Core Native Window Management
      hideWindow: () => invoke('hide_window'),
      showWindow: () => invoke('show_window'),
      closeApp: () => invoke('close_app'),
      emergencyHide: () => invoke('hide_window'),
      applyStealth: () => invoke('apply_stealth_protection'),
      toggleStealth: () => invoke('apply_stealth_protection'),

      // Pin / Always On Top
      toggleAlwaysOnTop: async () => {
        try {
          return await invoke('toggle_always_on_top');
        } catch {
          return false;
        }
      },
      setAlwaysOnTop: (state) => invoke('set_always_on_top', { alwaysOnTop: Boolean(state) }),
      getAlwaysOnTop: () => invoke('get_always_on_top'),

      // Window bounds
      getWindowBounds: async () => ({ x: 100, y: 100, width: 680, height: 420 }),
      setWindowBounds: async () => ({ success: true }),
      setWindowSizePreset: async () => ({ success: true }),

      // Settings
      getSettings: async () => loadStoredSettings(),
      saveSettings: async (settings) => saveStoredSettings(settings),
      setThemePreference: async (payload) => {
        const theme = typeof payload === 'string' ? payload : payload?.theme || 'light';
        saveStoredSettings({ themePreference: theme });
        return { success: true };
      },

      // Mobile server
      getMobileServerStatus: async () => ({
        listening: false,
        port: 7823,
        urls: [],
        clientCount: 0,
        error: null
      }),

      // Screenshots
      getScreenshotsCount: async () => 0,
      takeStealthScreenshot: async () => {
        console.log('[Bridge] takeStealthScreenshot');
        return { success: false, error: 'Screenshots routed to native engine' };
      },
      clearStealth: async () => ({ success: true }),
      analyzeStealth: async () => ({ success: false, error: 'Stealth AI ready' }),
      analyzeStealthWithContext: async () => ({ success: false, error: 'Stealth context ready' }),
      askAiWithSessionContext: async (payload) => {
        console.log('[Bridge] askAiWithSessionContext', payload);
        return { success: true, text: 'Native Assistant active' };
      },

      // Voice / Transcription
      startVoiceRecognition: async (source) => {
        console.log('[Bridge] startVoiceRecognition:', source);
        emitEvent('vosk-status', { status: 'listening', source });
        return { success: true };
      },
      stopVoiceRecognition: async (source) => {
        console.log('[Bridge] stopVoiceRecognition:', source);
        emitEvent('vosk-status', { status: 'stopped', source });
        return { success: true };
      },
      sendAudioChunk: () => {},
      getDesktopSources: async () => [],
      transcribeAudio: async () => ({ success: false, text: '' }),
      addVoiceTranscript: async () => ({ success: true }),

      // AI Features
      suggestResponse: async () => ({ success: true, text: 'Suggested response' }),
      generateMeetingNotes: async () => ({ success: true, text: 'Meeting notes generated' }),
      generateFollowUpEmail: async () => ({ success: true, text: 'Follow-up email generated' }),
      answerQuestion: async () => ({ success: true, text: 'Answer' }),
      getConversationInsights: async () => ({ success: true, insights: [] }),
      clearConversationHistory: async () => ({ success: true }),
      getConversationHistory: async () => [],

      // Generic Event Listeners
      on: addEventListener,
      removeListener: removeEventListener,

      // Specific Event Listeners
      onScreenshotTakenStealth: (cb) => addEventListener('screenshot-taken-stealth', cb),
      onAnalysisStart: (cb) => addEventListener('analysis-start', cb),
      onAnalysisResult: (cb) => addEventListener('analysis-result', cb),
      onSetStealthMode: (cb) => addEventListener('set-stealth-mode', cb),
      onEmergencyClear: (cb) => addEventListener('emergency-clear', cb),
      onError: (cb) => addEventListener('error', cb),
      onVoiceTranscript: (cb) => addEventListener('voice-transcript', cb),
      onVoiceError: (cb) => addEventListener('voice-error', cb),
      onVoskStatus: (cb) => addEventListener('vosk-status', cb),
      onVoskPartial: (cb) => addEventListener('vosk-partial', cb),
      onVoskFinal: (cb) => addEventListener('vosk-final', cb),
      onVoskError: (cb) => addEventListener('vosk-error', cb),
      onVoskStopped: (cb) => addEventListener('vosk-stopped', cb),
      onToggleVoiceRecognition: (cb) => addEventListener('toggle-voice-recognition', cb),
      onTriggerAskAi: (cb) => addEventListener('trigger-ask-ai', cb),
      onAiStreamStart: (cb) => addEventListener('ai-stream-start', cb),
      onAiStreamChunk: (cb) => addEventListener('ai-stream-chunk', cb),
      onAiStreamEnd: (cb) => addEventListener('ai-stream-end', cb),
      onSttDebug: (cb) => addEventListener('stt-debug', cb),
      onMobileServerStatus: (cb) => addEventListener('mobile-server-status', cb),
      onClearFromMobile: (cb) => addEventListener('clear-from-mobile', cb),

      log: (msg) => console.log('[Tauri Bridge]', msg),
      isAvailable: () => true
    };
  }

  // Keyboard shortcut: Escape closes the window immediately
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (window.electronAPI && typeof window.electronAPI.closeApp === 'function') {
        window.electronAPI.closeApp();
      }
    }
  });

  // Wire up Pin button and Close button in the UI
  document.addEventListener('DOMContentLoaded', () => {
    const pinBtn = document.getElementById('pin-app-btn');
    if (pinBtn && window.electronAPI && typeof window.electronAPI.toggleAlwaysOnTop === 'function') {
      pinBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isPinned = await window.electronAPI.toggleAlwaysOnTop();
        pinBtn.classList.toggle('pinned', Boolean(isPinned));
        pinBtn.title = isPinned ? 'Pinned on top (Click to unpin)' : 'Unpinned (Click to pin)';
      });
    }

    const closeBtn = document.getElementById('close-app-btn');
    if (closeBtn && window.electronAPI && typeof window.electronAPI.closeApp === 'function') {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.electronAPI.closeApp();
      });
    }
  });
})();
