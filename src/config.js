// AI provider configuration.
// Supported providers: 'gemini', 'ollama', 'antigravity', 'opencode', 'codex', 'claude-code'.
const AI_PROVIDERS = ['gemini', 'ollama', 'antigravity', 'opencode', 'codex', 'claude-code'];
const DEFAULT_AI_PROVIDER = 'antigravity';

// Dynamic Antigravity model cache (populated at runtime via `agy models`).
// Each entry is { id: string, name: string }.
let discoveredAntigravityModels = [];

// Dynamic OpenCode model cache (populated at runtime via `opencode models`).
// Each entry is { id: string, name: string, provider: string, isFree: boolean }.
let discoveredOpenCodeModels = [];

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = 'llama3.2';

// Gemini model configuration.
// The first model in this list is treated as the default model everywhere.
const GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-pro-preview'
];

// AssemblyAI speech model configuration.
// The first model in this list is treated as the default model everywhere.
const ASSEMBLY_AI_SPEECH_MODELS = [
  'universal-streaming-english',
  'universal-streaming-multilingual'
];

// Programming language configuration.
// The first language in this list is treated as the default language everywhere.
const PROGRAMMING_LANGUAGES = [
  'Python',
  'Java',
  'JavaScript',
  'TypeScript',
  'C++',
  'Go',
  'Rust',
  'C#',
  'Kotlin'
];

// Keyboard shortcuts configuration.
// Edit accelerators here to customize app shortcuts in one place.
const KEYBOARD_SHORTCUTS = [
  {
    id: 'toggleTranscription',
    buttonLabel: 'Transcription',
    description: 'Toggle transcription master control',
    accelerator: 'Alt+Shift+T'
  },
  {
    id: 'toggleQaWindow',
    buttonLabel: 'Q&A Window',
    description: 'Toggle separate Q&A companion window',
    accelerator: 'Alt+Shift+Q'
  },
  {
    id: 'takeScreenshot',
    buttonLabel: 'Screenshot',
    description: 'Capture screenshot',
    accelerator: 'Alt+Shift+S'
  },
  {
    id: 'askAi',
    buttonLabel: 'Ask AI',
    description: 'Uses only enabled transcript, enabled screenshots, and enabled chat context',
    accelerator: 'Alt+Shift+A'
  },
  {
    id: 'screenAi',
    buttonLabel: 'Screen AI',
    description: 'Analyzes only enabled screenshots selected in chat',
    accelerator: 'Alt+Shift+E'
  },
  {
    id: 'suggest',
    buttonLabel: 'Suggest',
    description: 'Uses only enabled transcript context to suggest what to say next',
    accelerator: 'Alt+Shift+G'
  },
  {
    id: 'notes',
    buttonLabel: 'Notes',
    description: 'Generates notes from only enabled context',
    accelerator: 'Alt+Shift+N'
  },
  {
    id: 'insights',
    buttonLabel: 'Insights',
    description: 'Finds key insights from only enabled context',
    accelerator: 'Alt+Shift+I'
  },
  {
    id: 'clearChat',
    buttonLabel: 'Clear Chat',
    description: 'Clears chat, screenshots, and AI history',
    accelerator: 'Alt+Shift+C'
  },
  {
    id: 'emergencyHide',
    buttonLabel: 'Hide',
    description: 'Emergency hide',
    accelerator: 'Alt+Shift+X'
  },
  {
    id: 'toggleAllWindows',
    buttonLabel: 'Hide / Restore All',
    description: 'Hide all windows to view the main screen, or restore them to their previous state',
    accelerator: 'Alt+Shift+V'
  },
  {
    id: 'toggleStealth',
    buttonLabel: 'Toggle Stealth',
    description: 'Toggle stealth mode',
    accelerator: 'Alt+Shift+H'
  },
  {
    id: 'moveWindowLeft',
    buttonLabel: 'Move Window Left',
    description: 'Move window to left side',
    accelerator: 'Alt+Shift+Left'
  },
  {
    id: 'moveWindowRight',
    buttonLabel: 'Move Window Right',
    description: 'Move window to right side',
    accelerator: 'Alt+Shift+Right'
  },
  {
    id: 'moveWindowUp',
    buttonLabel: 'Move Window Up',
    description: 'Move window to top',
    accelerator: 'Alt+Shift+Up'
  },
  {
    id: 'moveWindowDown',
    buttonLabel: 'Move Window Down',
    description: 'Move window to bottom',
    accelerator: 'Alt+Shift+Down'
  },
  {
    id: 'windowSizePreset1',
    buttonLabel: 'Size Preset 1',
    description: 'Resize window to minimum size',
    accelerator: 'Alt+Shift+1'
  },
  {
    id: 'windowSizePreset2',
    buttonLabel: 'Size Preset 2',
    description: 'Resize window to +25% from minimum size',
    accelerator: 'Alt+Shift+2'
  },
  {
    id: 'windowSizePreset3',
    buttonLabel: 'Size Preset 3',
    description: 'Resize window to +50% from minimum size',
    accelerator: 'Alt+Shift+3'
  },
  {
    id: 'windowSizePreset4',
    buttonLabel: 'Size Preset 4',
    description: 'Resize window to +75% from minimum size',
    accelerator: 'Alt+Shift+4'
  },
  {
    id: 'toggleClickThrough',
    buttonLabel: 'Ghost / Click-Through',
    description: 'Pass mouse clicks & typing directly to VS Code / Notepad through the overlay without moving or resizing',
    accelerator: 'Alt+Shift+P'
  },
  {
    id: 'togglePointerVisibility',
    buttonLabel: 'Pointer Stealth',
    description: 'Toggle mouse pointer visibility (hidden from interviewer on screen share, visible only to you)',
    accelerator: 'Alt+Shift+M'
  },
  {
    id: 'dockToTop',
    buttonLabel: 'Dock to Top',
    description: 'Dock HUD to thin top bar above your IDE / code editor',
    accelerator: 'Alt+Shift+D'
  }
];

// AI provider configuration functions
function getAiProviders() {
  return [...AI_PROVIDERS];
}

function getDefaultAiProvider() {
  return DEFAULT_AI_PROVIDER;
}

function isConfiguredAiProvider(providerName) {
  return AI_PROVIDERS.includes(providerName);
}

function resolveAiProvider(providerName) {
  return isConfiguredAiProvider(providerName) ? providerName : DEFAULT_AI_PROVIDER;
}

function getDefaultOllamaBaseUrl() {
  return DEFAULT_OLLAMA_BASE_URL;
}

function getDefaultOllamaModel() {
  return DEFAULT_OLLAMA_MODEL;
}

// Antigravity model configuration functions (dynamic discovery)
function normalizeDiscoveredModels(models) {
  if (!Array.isArray(models)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (const entry of models) {
    const id = typeof entry === 'string' ? entry.trim() : String(entry?.id || '').trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const name = typeof entry === 'string' ? id : String(entry?.name || id).trim();
    normalized.push({ id, name });
  }
  return normalized;
}

function setDiscoveredAntigravityModels(models) {
  discoveredAntigravityModels = normalizeDiscoveredModels(models);
  return getAntigravityModels();
}

function getAntigravityModelEntries() {
  return discoveredAntigravityModels.map((entry) => ({ ...entry }));
}

function getAntigravityModels() {
  return discoveredAntigravityModels.map((entry) => entry.id);
}

function getDefaultAntigravityModel() {
  return discoveredAntigravityModels[0]?.id || '';
}

function isConfiguredAntigravityModel(modelName) {
  const normalized = String(modelName || '').trim();
  if (!normalized) {
    return false;
  }
  if (discoveredAntigravityModels.length === 0) {
    return true;
  }
  return discoveredAntigravityModels.some((entry) => entry.id === normalized);
}

function resolveAntigravityModel(modelName) {
  const normalized = String(modelName || '').trim();
  if (!normalized) {
    return getDefaultAntigravityModel();
  }
  if (discoveredAntigravityModels.length === 0) {
    return normalized;
  }
  return isConfiguredAntigravityModel(normalized) ? normalized : getDefaultAntigravityModel();
}

// OpenCode model configuration functions (dynamic discovery + free model detection)
function normalizeDiscoveredOpenCodeModels(models) {
  if (!Array.isArray(models)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (const entry of models) {
    const id = typeof entry === 'string' ? entry.trim() : String(entry?.id || '').trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const name = typeof entry === 'string' ? id : String(entry?.name || id).trim();
    const provider = typeof entry === 'object' && entry?.provider
      ? String(entry.provider).trim()
      : (id.includes('/') ? id.split('/')[0] : 'opencode');
    const isFree = typeof entry === 'object' && typeof entry?.isFree === 'boolean'
      ? entry.isFree
      : (id.startsWith('opencode/') || /(?:^|[-/:])free$/i.test(id));
    normalized.push({ id, name, provider, isFree });
  }
  // Sort free models first so free models are prioritized by default
  normalized.sort((a, b) => {
    if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
    const aOpenCode = a.provider === 'opencode' ? 0 : 1;
    const bOpenCode = b.provider === 'opencode' ? 0 : 1;
    if (aOpenCode !== bOpenCode) return aOpenCode - bOpenCode;
    return a.id.localeCompare(b.id);
  });
  return normalized;
}

function setDiscoveredOpenCodeModels(models) {
  discoveredOpenCodeModels = normalizeDiscoveredOpenCodeModels(models);
  return getOpenCodeModels();
}

function getOpenCodeModelEntries() {
  return discoveredOpenCodeModels.map((entry) => ({ ...entry }));
}

function getOpenCodeModels() {
  return discoveredOpenCodeModels.map((entry) => entry.id);
}

function getFreeOpenCodeModels() {
  return discoveredOpenCodeModels.filter((entry) => entry.isFree).map((entry) => entry.id);
}

function getDefaultOpenCodeModel() {
  const free = discoveredOpenCodeModels.find((entry) => entry.isFree);
  return free?.id || discoveredOpenCodeModels[0]?.id || '';
}

function isConfiguredOpenCodeModel(modelName) {
  const normalized = String(modelName || '').trim();
  if (!normalized) {
    return false;
  }
  if (discoveredOpenCodeModels.length === 0) {
    return true;
  }
  return discoveredOpenCodeModels.some((entry) => entry.id === normalized);
}

function resolveOpenCodeModel(modelName) {
  const normalized = String(modelName || '').trim();
  if (!normalized) {
    return getDefaultOpenCodeModel();
  }
  if (discoveredOpenCodeModels.length === 0) {
    return normalized;
  }
  return isConfiguredOpenCodeModel(normalized) ? normalized : getDefaultOpenCodeModel();
}

// Gemini model configuration functions
function getGeminiModels() {
  if (!Array.isArray(GEMINI_MODELS) || GEMINI_MODELS.length === 0) {
    throw new Error('Gemini models are not configured. Add at least one model to src/config.js.');
  }

  return [...GEMINI_MODELS];
}

function getDefaultGeminiModel() {
  return getGeminiModels()[0];
}

function isConfiguredGeminiModel(modelName) {
  return getGeminiModels().includes(modelName);
}

function resolveGeminiModel(modelName) {
  return isConfiguredGeminiModel(modelName) ? modelName : getDefaultGeminiModel();
}

// Programming language configuration functions
function getProgrammingLanguages() {
  if (!Array.isArray(PROGRAMMING_LANGUAGES) || PROGRAMMING_LANGUAGES.length === 0) {
    throw new Error('Programming languages are not configured. Add at least one language to src/config.js.');
  }

  return [...PROGRAMMING_LANGUAGES];
}

function getDefaultProgrammingLanguage() {
  return getProgrammingLanguages()[0];
}

function isConfiguredProgrammingLanguage(languageName) {
  return getProgrammingLanguages().includes(languageName);
}

function resolveProgrammingLanguage(languageName) {
  return isConfiguredProgrammingLanguage(languageName)
    ? languageName
    : getDefaultProgrammingLanguage();
}

// AssemblyAI speech model configuration functions
function getAssemblyAiSpeechModels() {
  if (!Array.isArray(ASSEMBLY_AI_SPEECH_MODELS) || ASSEMBLY_AI_SPEECH_MODELS.length === 0) {
    throw new Error('AssemblyAI speech models are not configured. Add at least one model to src/config.js.');
  }

  return [...ASSEMBLY_AI_SPEECH_MODELS];
}

function getDefaultAssemblyAiSpeechModel() {
  return getAssemblyAiSpeechModels()[0];
}

function isConfiguredAssemblyAiSpeechModel(modelName) {
  return getAssemblyAiSpeechModels().includes(modelName);
}

function resolveAssemblyAiSpeechModel(modelName, fallbackModel = getDefaultAssemblyAiSpeechModel()) {
  if (isConfiguredAssemblyAiSpeechModel(modelName)) {
    return modelName;
  }

  if (isConfiguredAssemblyAiSpeechModel(fallbackModel)) {
    return fallbackModel;
  }

  return getDefaultAssemblyAiSpeechModel();
}

function getKeyboardShortcuts() {
  if (!Array.isArray(KEYBOARD_SHORTCUTS) || KEYBOARD_SHORTCUTS.length === 0) {
    throw new Error('Keyboard shortcuts are not configured. Add at least one shortcut to src/config.js.');
  }

  return KEYBOARD_SHORTCUTS.map((shortcut) => ({ ...shortcut }));
}

function getKeyboardShortcutById(shortcutId) {
  const normalizedId = String(shortcutId || '').trim();
  if (!normalizedId) {
    throw new Error('Shortcut id is required.');
  }

  const shortcut = getKeyboardShortcuts().find((entry) => entry.id === normalizedId);
  if (!shortcut) {
    throw new Error(`Shortcut "${normalizedId}" is not configured in src/config.js.`);
  }

  return shortcut;
}

// CLI agent configuration
const DEFAULT_CLI_AGENT_TYPE = 'codex';
const CLI_AGENT_TYPES = ['codex', 'claude-code', 'custom'];

function getCliAgentTypes() {
  return [...CLI_AGENT_TYPES];
}

function getDefaultCliAgentType() {
  return DEFAULT_CLI_AGENT_TYPE;
}

function getKeyboardShortcutAccelerator(shortcutId) {
  const shortcut = getKeyboardShortcutById(shortcutId);
  const accelerator = String(shortcut.accelerator || '').trim();
  if (!accelerator) {
    throw new Error(`Shortcut "${shortcutId}" is missing an accelerator in src/config.js.`);
  }

  return accelerator;
}

module.exports = {
  getAiProviders,
  getDefaultAiProvider,
  getDefaultOllamaBaseUrl,
  getDefaultOllamaModel,
  isConfiguredAiProvider,
  resolveAiProvider,
  getAssemblyAiSpeechModels,
  getDefaultAssemblyAiSpeechModel,
  getGeminiModels,
  getDefaultGeminiModel,
  getKeyboardShortcutAccelerator,
  getKeyboardShortcutById,
  getKeyboardShortcuts,
  getDefaultProgrammingLanguage,
  getProgrammingLanguages,
  isConfiguredAssemblyAiSpeechModel,
  isConfiguredGeminiModel,
  isConfiguredProgrammingLanguage,
  resolveAssemblyAiSpeechModel,
  resolveGeminiModel,
  resolveProgrammingLanguage,
  getCliAgentTypes,
  getDefaultCliAgentType,
  setDiscoveredAntigravityModels,
  getAntigravityModelEntries,
  getAntigravityModels,
  getDefaultAntigravityModel,
  isConfiguredAntigravityModel,
  resolveAntigravityModel,
  setDiscoveredOpenCodeModels,
  getOpenCodeModelEntries,
  getOpenCodeModels,
  getFreeOpenCodeModels,
  getDefaultOpenCodeModel,
  isConfiguredOpenCodeModel,
  resolveOpenCodeModel
};
