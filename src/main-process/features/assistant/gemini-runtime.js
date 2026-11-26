const GeminiService = require('../../../services/ai/gemini-service');
const OllamaService = require('../../../services/ai/ollama-service');
const AntigravityService = require('../../../services/ai/antigravity-service');
const { fetchAntigravityModels, isAntigravityInstalled } = require('../../../services/ai/antigravity-service');
const OpenCodeService = require('../../../services/ai/opencode-service');
const { fetchOpenCodeModels } = require('../../../services/ai/opencode-service');
const { isOpenCodeInstalled } = require('../../../services/ai/opencode-installer');
const CliAgentService = require('../../../services/ai/cli-agent-service');
const { isCliAgentInstalled } = require('../../../services/ai/cli-agent-service');
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
  getAntigravityModelEntries,
  getAntigravityModels,
  getDefaultAntigravityModel,
  resolveAntigravityModel,
  getOpenCodeModelEntries,
  getOpenCodeModels,
  getFreeOpenCodeModels,
  getDefaultOpenCodeModel,
  resolveOpenCodeModel
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

function buildUniqueCandidateList(primary, list = []) {
  const seen = new Set();
  const result = [];
  for (const item of [primary, ...(Array.isArray(list) ? list : [])]) {
    const normalized = String(item || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function createGeminiRuntime(deps = {}) {
  const checkAntigravityInstalled = deps.isAntigravityInstalled || isAntigravityInstalled;
  const checkOpenCodeInstalled = deps.isOpenCodeInstalled || isOpenCodeInstalled;
  const checkCliAgentInstalled = deps.isCliAgentInstalled || isCliAgentInstalled;
  const checkOllamaReachable = deps.isOllamaReachable || (async (baseUrl) => {
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch (_) {
      return false;
    }
  });
  let geminiService = null;
  let ollamaService = null;
  let antigravityService = null;
  let opencodeService = null;
  let cliAgentService = null;
  let activeAiProvider = getDefaultAiProvider();
  let activeGeminiModel = getDefaultGeminiModel();
  let activeAntigravityModel = getDefaultAntigravityModel();
  let activeOpenCodeModel = getDefaultOpenCodeModel();
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

  async function executeWithAntigravityFailover(operation) {
    let candidates = buildUniqueCandidateList(activeAntigravityModel, getAntigravityModels());
    if (candidates.length === 0 && process.env.NODE_ENV !== 'test') {
      await refreshAntigravityModels().catch(() => {});
      candidates = buildUniqueCandidateList(activeAntigravityModel, getAntigravityModels());
    }
    if (candidates.length === 0) {
      candidates = [''];
    }

    let lastError = null;
    for (let i = 0; i < candidates.length; i += 1) {
      const model = candidates[i];
      const service = initializeAntigravityService(activeProgrammingLanguage, model);
      if (!service) {
        lastError = new Error('Antigravity service not available. Install the agy CLI and ensure it is in PATH.');
        continue;
      }
      try {
        return await operation(service, {
          provider: 'antigravity',
          modelName: model,
          activeApiKeyIndex: 0,
          activeApiKey: '',
          attempt: i + 1,
          totalKeys: 0
        });
      } catch (error) {
        lastError = error;
        console.warn(`[Router] Antigravity model "${model || 'default'}" failed (${error.message}). Trying next candidate...`);
      }
    }
    throw lastError || new Error('All Antigravity models failed.');
  }

  async function executeWithOpenCodeFailover(operation) {
    let candidates = buildUniqueCandidateList(activeOpenCodeModel, [
      ...getFreeOpenCodeModels(),
      ...getOpenCodeModels()
    ]);
    if (candidates.length === 0 && process.env.NODE_ENV !== 'test') {
      await refreshOpenCodeModels().catch(() => {});
      candidates = buildUniqueCandidateList(activeOpenCodeModel, [
        ...getFreeOpenCodeModels(),
        ...getOpenCodeModels()
      ]);
    }
    if (candidates.length === 0) {
      candidates = [''];
    }

    // Cap OpenCode model fallback attempts to 5 so we don't iterate hundreds of models on network outage
    const boundedCandidates = candidates.slice(0, 5);
    let lastError = null;
    for (let i = 0; i < boundedCandidates.length; i += 1) {
      const model = boundedCandidates[i];
      const service = initializeOpenCodeService(activeProgrammingLanguage, model);
      if (!service) {
        lastError = new Error('OpenCode service not available. Install the opencode CLI and ensure it is in PATH.');
        continue;
      }
      try {
        return await operation(service, {
          provider: 'opencode',
          modelName: model,
          activeApiKeyIndex: 0,
          activeApiKey: '',
          attempt: i + 1,
          totalKeys: 0
        });
      } catch (error) {
        lastError = error;
        console.warn(`[Router] OpenCode model "${model || 'default'}" failed (${error.message}). Trying next candidate...`);
      }
    }
    throw lastError || new Error('All OpenCode models failed.');
  }

  async function executeWithOllamaFailover(operation) {
    if (!ollamaService) {
      initializeOllamaService();
    }
    if (!ollamaService) {
      throw new Error('Ollama service not available. Check that Ollama is running.');
    }
    return await operation(ollamaService, {
      provider: 'ollama',
      modelName: activeOllamaModel,
      activeApiKeyIndex: 0,
      activeApiKey: '',
      attempt: 1,
      totalKeys: 0
    });
  }

  async function executeWithCliAgentFailover(agentType, operation) {
    const service = initializeCliAgentService(agentType, activeCliAgentCmd, activeProgrammingLanguage);
    if (!service) {
      throw new Error(`CLI agent service (${agentType}) not available.`);
    }
    return await operation(service, {
      provider: agentType,
      modelName: agentType,
      activeApiKeyIndex: 0,
      activeApiKey: '',
      attempt: 1,
      totalKeys: 0
    });
  }

  async function executeWithGeminiFailover(operation) {
    if (!hasApiKeys()) {
      throw new Error('No Gemini API key configured. Add it in Settings.');
    }

    const candidateModels = buildUniqueCandidateList(activeGeminiModel, getGeminiModels());
    let lastError = null;

    for (const modelName of candidateModels) {
      const totalKeys = geminiApiKeys.length;
      const startIndex = activeApiKeyIndex;
      let attemptedKeys = 0;
      let lastSwitchEligibleError = null;

      while (attemptedKeys < totalKeys) {
        const activeApiKey = getActiveApiKey();
        if (!activeApiKey) {
          break;
        }

        if (!geminiService || geminiService.apiKey !== activeApiKey || geminiService.modelName !== modelName) {
          initializeGeminiService(activeApiKey, modelName, activeProgrammingLanguage);
        }

        try {
          return await operation(geminiService, {
            provider: 'gemini',
            modelName,
            activeApiKeyIndex,
            activeApiKey,
            attempt: attemptedKeys + 1,
            totalKeys
          });
        } catch (error) {
          lastError = error;
          if (isSwitchEligibleError(error)) {
            lastSwitchEligibleError = error;
            attemptedKeys += 1;

            if (attemptedKeys >= totalKeys) {
              if (activeApiKeyIndex !== startIndex) {
                setActiveApiKeyIndex(startIndex);
                initializeGeminiService(getActiveApiKey(), activeGeminiModel, activeProgrammingLanguage);
              }
              break;
            }

            switchToNextKey();
          } else {
            // Model-level or transient error: break key loop and try next Gemini model
            console.warn(`[Router] Gemini model "${modelName}" failed (${error.message}). Trying next Gemini model...`);
            break;
          }
        }
      }

      if (lastSwitchEligibleError && attemptedKeys >= totalKeys) {
        lastError = createAllKeysUnavailableError(lastSwitchEligibleError);
      }
    }

    throw lastError || createAllKeysUnavailableError(null);
  }

  async function isProviderConfiguredForFallback(provider) {
    if (provider === 'antigravity') {
      return Boolean(await checkAntigravityInstalled().catch(() => false));
    }
    if (provider === 'opencode') {
      return Boolean(await checkOpenCodeInstalled().catch(() => false));
    }
    if (provider === 'gemini') {
      return hasApiKeys();
    }
    if (provider === 'ollama') {
      return Boolean(activeOllamaBaseUrl && activeOllamaModel) && await checkOllamaReachable(activeOllamaBaseUrl);
    }
    if (provider === 'codex' || provider === 'claude-code') {
      return Boolean(await checkCliAgentInstalled(provider).catch(() => false));
    }
    return false;
  }

  async function executeProviderByName(provider, operation) {
    if (provider === 'antigravity') return executeWithAntigravityFailover(operation);
    if (provider === 'opencode') return executeWithOpenCodeFailover(operation);
    if (provider === 'gemini') return executeWithGeminiFailover(operation);
    if (provider === 'ollama') return executeWithOllamaFailover(operation);
    if (provider === 'codex' || provider === 'claude-code') return executeWithCliAgentFailover(provider, operation);
    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  async function executeWithKeyFailover(operation) {
    if (typeof operation !== 'function') {
      throw new Error('AI failover operation must be a function.');
    }

    const fallbackOrder = ['antigravity', 'opencode', 'gemini', 'ollama', 'codex', 'claude-code']
      .filter((p) => p !== activeAiProvider);

    let primaryError = null;
    try {
      return await executeProviderByName(activeAiProvider, operation);
    } catch (error) {
      primaryError = error;
      console.warn(`[Router] Primary provider "${activeAiProvider}" failed (${error.message}). Checking fallback providers...`);
    }

    for (const fallbackProvider of fallbackOrder) {
      const available = await isProviderConfiguredForFallback(fallbackProvider);
      if (!available) {
        continue;
      }
      try {
        console.log(`[Router] Failing over from "${activeAiProvider}" to "${fallbackProvider}"...`);
        return await executeProviderByName(fallbackProvider, operation);
      } catch (fallbackError) {
        console.warn(`[Router] Fallback provider "${fallbackProvider}" failed (${fallbackError.message}).`);
      }
    }

    throw primaryError;
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

  function initializeOpenCodeService(
    programmingLanguage = activeProgrammingLanguage,
    modelName = activeOpenCodeModel
  ) {
    activeProgrammingLanguage = resolveProgrammingLanguage(programmingLanguage);
    activeOpenCodeModel = resolveOpenCodeModel(modelName);
    try {
      console.log(
        'Initializing OpenCode AI Service with model and language:',
        activeOpenCodeModel || 'default',
        activeProgrammingLanguage
      );
      if (opencodeService) {
        opencodeService.updateConfiguration({
          programmingLanguage: activeProgrammingLanguage,
          modelName: activeOpenCodeModel
        });
      } else {
        opencodeService = new OpenCodeService({
          programmingLanguage: activeProgrammingLanguage,
          modelName: activeOpenCodeModel
        });
      }
      console.log('OpenCode AI Service initialized successfully');
      return opencodeService;
    } catch (error) {
      opencodeService = null;
      console.error('Failed to initialize OpenCode AI Service:', error);
      return null;
    }
  }

  async function refreshAntigravityModels() {
    const entries = await fetchAntigravityModels();
    if (entries.length > 0) {
      const resolved = resolveAntigravityModel(activeAntigravityModel);
      if (resolved && resolved !== activeAntigravityModel) {
        activeAntigravityModel = resolved;
        if (antigravityService) {
          antigravityService.updateConfiguration({ modelName: activeAntigravityModel });
        }
      }
    }
    return {
      models: getAntigravityModels(),
      entries: getAntigravityModelEntries(),
      defaultModel: getDefaultAntigravityModel(),
      activeModel: activeAntigravityModel
    };
  }

  async function refreshOpenCodeModels() {
    const { models, freeModels } = await fetchOpenCodeModels();
    if (models.length > 0) {
      const resolved = resolveOpenCodeModel(activeOpenCodeModel);
      if (resolved && resolved !== activeOpenCodeModel) {
        activeOpenCodeModel = resolved;
        if (opencodeService) {
          opencodeService.updateConfiguration({ modelName: activeOpenCodeModel });
        }
      }
    }
    return {
      models: getOpenCodeModels(),
      freeModels: getFreeOpenCodeModels(),
      entries: getOpenCodeModelEntries(),
      defaultModel: getDefaultOpenCodeModel(),
      activeModel: activeOpenCodeModel
    };
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
    if (activeAiProvider === 'opencode') {
      return initializeOpenCodeService(activeProgrammingLanguage, activeOpenCodeModel);
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
    if (activeAiProvider === 'opencode') {
      return opencodeService;
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
    initializeOpenCodeService,
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
    getAntigravityModelEntries,
    getAntigravityModels,
    getDefaultAntigravityModel,
    getActiveAntigravityModel: () => activeAntigravityModel,
    setActiveAntigravityModel: (modelName) => {
      activeAntigravityModel = resolveAntigravityModel(modelName);
      return activeAntigravityModel;
    },
    refreshAntigravityModels,
    getOpenCodeModelEntries,
    getOpenCodeModels,
    getFreeOpenCodeModels,
    getDefaultOpenCodeModel,
    getActiveOpenCodeModel: () => activeOpenCodeModel,
    setActiveOpenCodeModel: (modelName) => {
      activeOpenCodeModel = resolveOpenCodeModel(modelName);
      return activeOpenCodeModel;
    },
    refreshOpenCodeModels,
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
