const GeminiService = require('../../../services/ai/gemini-service');
const OllamaService = require('../../../services/ai/ollama-service');
const AntigravityService = require('../../../services/ai/antigravity-service');
const CliAgentService = require('../../../services/ai/cli-agent-service');
const {
  resolveAiProvider,
  getAiProviders,
  getDefaultAiProvider,
  getDefaultOllamaBaseUrl,
  getDefaultOllamaModel,
  resolveGeminiModel,
  resolveProgrammingLanguage,
  getGeminiModels,
  getDefaultGeminiModel,
  getProgrammingLanguages,
  getDefaultProgrammingLanguage,
  getCliAgentTypes,
  getDefaultCliAgentType,
  getAntigravityModels,
  getDefaultAntigravityModel,
  resolveAntigravityModel
} = require('../../../config');

const GEMINI_ALL_KEYS_UNAVAILABLE_ERROR_CODE = 'GEMINI_ALL_KEYS_UNAVAILABLE';

function normalizeGeminiApiKeys(keys) {
  const sourceValues = Array.isArray(keys)
    ? keys
    : String(keys ?? '').split(',');
  const seen = new Set();
  const nextKeys = [];

  for (const rawValue of sourceValues) {
    const key = String(rawValue || '').trim();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    nextKeys.push(key);
  }

  return nextKeys;
}

function createGeminiRuntime() {
  let geminiService = null;
  let ollamaService = null;
  let antigravityService = null;
  let cliAgentService = null;
  let activeAiProvider = getDefaultAiProvider();
  let activeGeminiModel = getDefaultGeminiModel();
  let activeAntigravityModel = getDefaultAntigravityModel();
  let activeProgrammingLanguage = getDefaultProgrammingLanguage();
  let activeOllamaBaseUrl = getDefaultOllamaBaseUrl();
  let activeOllamaModel = getDefaultOllamaModel();
  let activeCliAgentType = getDefaultCliAgentType();
  let activeCliAgentCmd = '';
  let geminiApiKeys = [];
  let activeApiKeyIndex = 0;
  let activeKeyIndexChangeHandler = null;

  function notifyActiveKeyIndexChanged(index) {
    if (typeof activeKeyIndexChangeHandler !== 'function') {
      return;
    }

    try {
      activeKeyIndexChangeHandler(index);
    } catch (error) {
      console.error('Failed to persist active Gemini API key index:', error);
    }
  }

  function normalizeKeyIndex(index) {
    if (geminiApiKeys.length === 0) {
      return 0;
    }

    const parsedIndex = Number.parseInt(String(index ?? ''), 10);
    const safeIndex = Number.isFinite(parsedIndex) ? parsedIndex : 0;
    const maxIndex = geminiApiKeys.length - 1;

    return Math.min(Math.max(safeIndex, 0), maxIndex);
  }

  function setActiveApiKeyIndex(index, options = {}) {
    const nextIndex = normalizeKeyIndex(index);
    const shouldNotify = options.notify !== false;
    const changed = nextIndex !== activeApiKeyIndex;
    activeApiKeyIndex = nextIndex;

    if (changed && shouldNotify) {
      notifyActiveKeyIndexChanged(activeApiKeyIndex);
    }

    return activeApiKeyIndex;
  }

  function getActiveApiKey() {
    if (geminiApiKeys.length === 0) {
      return '';
    }

    return geminiApiKeys[activeApiKeyIndex] || '';
  }

  function hasApiKeys() {
    return geminiApiKeys.length > 0;
  }

  function initializeGeminiService(
    apiKey = getActiveApiKey(),
    modelName = activeGeminiModel,
    programmingLanguage = activeProgrammingLanguage
  ) {
    activeGeminiModel = resolveGeminiModel(modelName);
    activeProgrammingLanguage = resolveProgrammingLanguage(programmingLanguage);

    try {
      if (!apiKey) {
        console.error('Gemini API key not configured in app settings');
        geminiService = null;
        return null;
      }

      console.log(
        'Initializing Gemini AI Service with model and language:',
        activeGeminiModel,
        activeProgrammingLanguage
      );

      if (geminiService) {
        geminiService.updateConfiguration({
          apiKey,
          modelName: activeGeminiModel,
          programmingLanguage: activeProgrammingLanguage
        });
      } else {
        geminiService = new GeminiService(apiKey, {
          modelName: activeGeminiModel,
          programmingLanguage: activeProgrammingLanguage
        });
      }

      console.log('Gemini AI Service initialized successfully');
      return geminiService;
    } catch (error) {
      geminiService = null;
      console.error('Failed to initialize Gemini AI Service:', error);
      return null;
    }
  }

  function setKeys(apiKeys, preferredIndex = 0) {
    geminiApiKeys = normalizeGeminiApiKeys(apiKeys);

    if (!hasApiKeys()) {
      setActiveApiKeyIndex(0);
      geminiService = null;
      return {
        geminiApiKeys: [],
        activeApiKeyIndex: 0,
        activeApiKey: ''
      };
    }

    setActiveApiKeyIndex(preferredIndex);

    return {
      geminiApiKeys: [...geminiApiKeys],
      activeApiKeyIndex,
      activeApiKey: getActiveApiKey()
    };
  }

  function getApiKeys() {
    return [...geminiApiKeys];
  }

  function switchToNextKey() {
    if (!hasApiKeys()) {
      return {
        switched: false,
        activeApiKeyIndex,
        activeApiKey: ''
      };
    }

    if (geminiApiKeys.length === 1) {
      return {
        switched: false,
        activeApiKeyIndex,
        activeApiKey: getActiveApiKey()
      };
    }

    const previousIndex = activeApiKeyIndex;
    const nextIndex = (activeApiKeyIndex + 1) % geminiApiKeys.length;
    setActiveApiKeyIndex(nextIndex);

    if (nextIndex === previousIndex) {
      return {
        switched: false,
        activeApiKeyIndex,
        activeApiKey: getActiveApiKey()
      };
    }

    initializeGeminiService(getActiveApiKey(), activeGeminiModel, activeProgrammingLanguage);

    return {
      switched: true,
      activeApiKeyIndex,
      activeApiKey: getActiveApiKey()
    };
  }

  function isSwitchEligibleError(error) {
    if (!error) {
      return false;
    }

    if (geminiService?.isQuotaExhaustedError?.(error)) {
      return true;
    }

    if (geminiService?.isAuthenticationError?.(error)) {
      return true;
    }

    const message = String(error?.message || '').toLowerCase();
    return (
      message.includes('quota exceeded') ||
      message.includes('api key not valid') ||
      message.includes('invalid api key') ||
      message.includes('permission denied') ||
      message.includes('401') ||
      message.includes('403') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')
    );
  }

  function createAllKeysUnavailableError(cause) {
    const allKeysUnavailableError = new Error(
      'All configured Gemini API keys are currently unavailable due to quota or authentication errors.'
    );

    allKeysUnavailableError.code = GEMINI_ALL_KEYS_UNAVAILABLE_ERROR_CODE;
    allKeysUnavailableError.isAllKeysUnavailable = true;
    if (cause) {
      allKeysUnavailableError.cause = cause;
    }

    return allKeysUnavailableError;
  }

  function isAllKeysUnavailableError(error) {
    return Boolean(
      error && (
        error.code === GEMINI_ALL_KEYS_UNAVAILABLE_ERROR_CODE ||
        error.isAllKeysUnavailable === true
      )
    );
  }

  async function executeWithKeyFailover(operation) {
    if (typeof operation !== 'function') {
      throw new Error('AI failover operation must be a function.');
    }

    // For Ollama, no key failover — just execute directly
    if (activeAiProvider === 'ollama') {
      if (!ollamaService) {
        initializeOllamaService();
      }
      if (!ollamaService) {
        throw new Error('Ollama service not available. Check that Ollama is running.');
      }
      return await operation(ollamaService, {
        activeApiKeyIndex: 0,
        activeApiKey: '',
        attempt: 1,
        totalKeys: 0
      });
    }

    // For Antigravity CLI, no key failover — execute directly
    if (activeAiProvider === 'antigravity') {
      if (!antigravityService) {
        initializeAntigravityService();
      }
      if (!antigravityService) {
        throw new Error('Antigravity service not available. Install the agy CLI and ensure it is in PATH.');
      }
      return await operation(antigravityService, {
        activeApiKeyIndex: 0,
        activeApiKey: '',
        attempt: 1,
        totalKeys: 0
      });
    }

    // For CLI agents (codex, claude-code, custom), no key failover — execute directly
    if (activeAiProvider === 'codex' || activeAiProvider === 'claude-code') {
      if (!cliAgentService) {
        initializeCliAgentService(activeAiProvider);
      }
      if (!cliAgentService) {
        throw new Error(`CLI agent service (${activeAiProvider}) not available.`);
      }
      return await operation(cliAgentService, {
        activeApiKeyIndex: 0,
        activeApiKey: '',
        attempt: 1,
        totalKeys: 0
      });
    }

    if (!hasApiKeys()) {
      throw new Error('No Gemini API key configured. Add it in Settings.');
    }

    const totalKeys = geminiApiKeys.length;
    const startIndex = activeApiKeyIndex;
    let attemptedKeys = 0;
    let lastSwitchEligibleError = null;

    while (attemptedKeys < totalKeys) {
      const activeApiKey = getActiveApiKey();
      if (!activeApiKey) {
        break;
      }

      if (!geminiService || geminiService.apiKey !== activeApiKey) {
        initializeGeminiService(activeApiKey, activeGeminiModel, activeProgrammingLanguage);
      }

      try {
        return await operation(geminiService, {
          activeApiKeyIndex,
          activeApiKey,
          attempt: attemptedKeys + 1,
          totalKeys
        });
      } catch (error) {
        if (!isSwitchEligibleError(error)) {
          throw error;
        }

        lastSwitchEligibleError = error;
        attemptedKeys += 1;

        if (attemptedKeys >= totalKeys) {
          if (activeApiKeyIndex !== startIndex) {
            setActiveApiKeyIndex(startIndex);
            initializeGeminiService(getActiveApiKey(), activeGeminiModel, activeProgrammingLanguage);
          }

          throw createAllKeysUnavailableError(lastSwitchEligibleError);
        }

        switchToNextKey();
      }
    }

    throw createAllKeysUnavailableError(lastSwitchEligibleError);
  }

  function initializeOllamaService(
    baseUrl = activeOllamaBaseUrl,
    modelName = activeOllamaModel,
    programmingLanguage = activeProgrammingLanguage
  ) {
    activeOllamaBaseUrl = String(baseUrl || getDefaultOllamaBaseUrl()).replace(/\/+$/, '');
    activeOllamaModel = String(modelName || getDefaultOllamaModel()).trim();
    activeProgrammingLanguage = resolveProgrammingLanguage(programmingLanguage);

    try {
      console.log(
        'Initializing Ollama AI Service with model and language:',
        activeOllamaModel,
        activeProgrammingLanguage
      );

      if (ollamaService) {
        ollamaService.updateConfiguration({
          baseUrl: activeOllamaBaseUrl,
          modelName: activeOllamaModel,
          programmingLanguage: activeProgrammingLanguage
        });
      } else {
        ollamaService = new OllamaService({
          baseUrl: activeOllamaBaseUrl,
          modelName: activeOllamaModel,
          programmingLanguage: activeProgrammingLanguage
        });
      }

      console.log('Ollama AI Service initialized successfully');
      return ollamaService;
    } catch (error) {
      ollamaService = null;
      console.error('Failed to initialize Ollama AI Service:', error);
      return null;
    }
  }

  function initializeAntigravityService(
    programmingLanguage = activeProgrammingLanguage,
    modelName = activeAntigravityModel
  ) {
    activeProgrammingLanguage = resolveProgrammingLanguage(programmingLanguage);
    activeAntigravityModel = resolveAntigravityModel(modelName);
    try {
      console.log(
        'Initializing Antigravity AI Service with model and language:',
        activeAntigravityModel,
        activeProgrammingLanguage
      );
      if (antigravityService) {
        antigravityService.updateConfiguration({
          programmingLanguage: activeProgrammingLanguage,
          modelName: activeAntigravityModel
        });
      } else {
        antigravityService = new AntigravityService({
          programmingLanguage: activeProgrammingLanguage,
          modelName: activeAntigravityModel
        });
      }
      console.log('Antigravity AI Service initialized successfully');
      return antigravityService;
    } catch (error) {
      antigravityService = null;
      console.error('Failed to initialize Antigravity AI Service:', error);
      return null;
    }
  }

  function initializeCliAgentService(
    agentType = activeCliAgentType,
    customCmd = activeCliAgentCmd,
    programmingLanguage = activeProgrammingLanguage
  ) {
    activeCliAgentType = agentType || getDefaultCliAgentType();
    activeCliAgentCmd = String(customCmd || '');
    activeProgrammingLanguage = resolveProgrammingLanguage(programmingLanguage);

    try {
      console.log(
        'Initializing CLI Agent Service:',
        activeCliAgentType,
        'cmd:',
        activeCliAgentCmd,
        'language:',
        activeProgrammingLanguage
      );

      if (cliAgentService) {
        cliAgentService.updateConfiguration({
          agentType: activeCliAgentType,
          customCmd: activeCliAgentCmd,
          programmingLanguage: activeProgrammingLanguage
        });
      } else {
        cliAgentService = new CliAgentService({
          agentType: activeCliAgentType,
          customCmd: activeCliAgentCmd,
          programmingLanguage: activeProgrammingLanguage
        });
      }

      console.log(`CLI Agent Service (${activeCliAgentType}) initialized successfully`);
      return cliAgentService;
    } catch (error) {
      cliAgentService = null;
      console.error('Failed to initialize CLI Agent Service:', error);
      return null;
    }
  }

  function initializeAiService() {
    if (activeAiProvider === 'ollama') {
      return initializeOllamaService(activeOllamaBaseUrl, activeOllamaModel, activeProgrammingLanguage);
    }
    if (activeAiProvider === 'antigravity') {
      return initializeAntigravityService(activeProgrammingLanguage, activeAntigravityModel);
    }
    if (activeAiProvider === 'codex' || activeAiProvider === 'claude-code') {
      return initializeCliAgentService(activeAiProvider, activeCliAgentCmd, activeProgrammingLanguage);
    }
    return initializeGeminiService(getActiveApiKey(), activeGeminiModel, activeProgrammingLanguage);
  }

  function setActiveAiProvider(providerName) {
    activeAiProvider = resolveAiProvider(providerName);
    return activeAiProvider;
  }

  function getActiveAiProvider() {
    return activeAiProvider;
  }

  function setActiveOllamaBaseUrl(baseUrl) {
    activeOllamaBaseUrl = String(baseUrl || getDefaultOllamaBaseUrl()).replace(/\/+$/, '');
    return activeOllamaBaseUrl;
  }

  function getActiveOllamaBaseUrl() {
    return activeOllamaBaseUrl;
  }

  function setActiveOllamaModel(modelName) {
    activeOllamaModel = String(modelName || getDefaultOllamaModel()).trim();
    return activeOllamaModel;
  }

  function getActiveOllamaModel() {
    return activeOllamaModel;
  }

  function getActiveCliAgentType() {
    return activeCliAgentType;
  }

  function setActiveCliAgentType(type) {
    activeCliAgentType = type || getDefaultCliAgentType();
    return activeCliAgentType;
  }

  function getActiveCliAgentCmd() {
    return activeCliAgentCmd;
  }

  function setActiveCliAgentCmd(cmd) {
    activeCliAgentCmd = String(cmd || '');
    return activeCliAgentCmd;
  }

  function getService() {
    if (activeAiProvider === 'ollama') {
      return ollamaService;
    }
    if (activeAiProvider === 'antigravity') {
      return antigravityService;
    }
    if (activeAiProvider === 'codex' || activeAiProvider === 'claude-code') {
      return cliAgentService;
    }
    return geminiService;
  }

  function getActiveGeminiModel() {
    return activeGeminiModel;
  }

  function getActiveProgrammingLanguage() {
    return activeProgrammingLanguage;
  }

  function setActiveGeminiModel(modelName) {
    activeGeminiModel = resolveGeminiModel(modelName);
    return activeGeminiModel;
  }

  function setActiveProgrammingLanguage(language) {
    activeProgrammingLanguage = resolveProgrammingLanguage(language);
    return activeProgrammingLanguage;
  }

  function setActiveKeyIndexChangeHandler(handler) {
    activeKeyIndexChangeHandler = typeof handler === 'function' ? handler : null;
  }

  return {
    initializeGeminiService,
    initializeOllamaService,
    initializeAntigravityService,
    initializeCliAgentService,
    initializeAiService,
    setKeys,
    getApiKeys,
    hasApiKeys,
    getActiveApiKey,
    getActiveApiKeyIndex: () => activeApiKeyIndex,
    switchToNextKey,
    executeWithKeyFailover,
    isAllKeysUnavailableError,
    setActiveKeyIndexChangeHandler,
    getService,
    getAiProviders,
    getDefaultAiProvider,
    getActiveAiProvider,
    setActiveAiProvider,
    getGeminiModels,
    getDefaultGeminiModel,
    getActiveGeminiModel,
    setActiveGeminiModel,
    getAntigravityModels,
    getDefaultAntigravityModel,
    getActiveAntigravityModel: () => activeAntigravityModel,
    setActiveAntigravityModel: (modelName) => {
      activeAntigravityModel = resolveAntigravityModel(modelName);
      return activeAntigravityModel;
    },
    getDefaultOllamaBaseUrl,
    getDefaultOllamaModel,
    getActiveOllamaBaseUrl,
    setActiveOllamaBaseUrl,
    getActiveOllamaModel,
    setActiveOllamaModel,
    getCliAgentTypes,
    getDefaultCliAgentType,
    getActiveCliAgentType,
    setActiveCliAgentType,
    getActiveCliAgentCmd,
    setActiveCliAgentCmd,
    getProgrammingLanguages,
    getDefaultProgrammingLanguage,
    getActiveProgrammingLanguage,
    setActiveProgrammingLanguage
  };
}

module.exports = {
  GEMINI_ALL_KEYS_UNAVAILABLE_ERROR_CODE,
  createGeminiRuntime
};
