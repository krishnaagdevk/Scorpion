// ============================================================================
// OPENCODE CLI AI SERVICE - Scorpion AI Assistant
// ============================================================================
// Routes AI requests through the OpenCode CLI (`opencode`).
// Auto-detects available & free OpenCode models via `opencode models`.
// Implements the same public interface as AntigravityService / GeminiService.
// ============================================================================

const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  resolveProgrammingLanguage,
  getDefaultOpenCodeModel,
  resolveOpenCodeModel,
  setDiscoveredOpenCodeModels,
  getOpenCodeModelEntries
} = require('../../config');
const {
  buildAnswerQuestionPrompt,
  buildAskAiSessionPrompt,
  buildFollowUpEmailPrompt,
  buildInsightsPrompt,
  buildMeetingNotesPrompt,
  buildScreenshotAnalysisPrompt,
  buildSuggestResponsePrompt
} = require('./prompts');
const {
  resolveOpenCodeCommand,
  isCmdWrapper,
  isOpenCodeInstalled
} = require('./opencode-installer');

const ISOLATED_OPENCODE_WORKSPACE = path.join(os.tmpdir(), 'scorpion-opencode-workspace');
const ISOLATED_OPENCODE_CONFIG = path.join(os.tmpdir(), 'scorpion-opencode-config');

for (const dir of [ISOLATED_OPENCODE_WORKSPACE, ISOLATED_OPENCODE_CONFIG]) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {}
  }
}

// Parse `opencode models` (plain or `--verbose` JSON blocks) into [{ id, name, provider, isFree }]
function parseOpenCodeModelsOutput(rawOutput) {
  const text = String(rawOutput || '');
  const lines = text.split(/\r?\n/);
  const models = [];
  const seen = new Set();

  let currentId = null;
  let jsonLines = [];
  let braceDepth = 0;
  let inJson = false;

  const commitModel = (id, meta = null) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId || !normalizedId.includes('/') || seen.has(normalizedId)) {
      return;
    }
    if (meta && meta.status === 'deprecated') {
      return;
    }
    seen.add(normalizedId);

    const slashIdx = normalizedId.indexOf('/');
    const provider = String(meta?.providerID || normalizedId.slice(0, slashIdx)).trim();
    const displayName = String(meta?.name || normalizedId).trim();

    let isFree = false;
    if (meta && meta.cost && typeof meta.cost.input === 'number' && typeof meta.cost.output === 'number') {
      isFree = meta.cost.input === 0 && meta.cost.output === 0;
    } else {
      isFree = provider === 'opencode' || /(?:^|[-/:])free$/i.test(normalizedId);
    }

    models.push({
      id: normalizedId,
      name: displayName,
      provider,
      isFree
    });
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (inJson) {
      jsonLines.push(rawLine);
      for (const ch of rawLine) {
        if (ch === '{') braceDepth += 1;
        else if (ch === '}') braceDepth -= 1;
      }
      if (braceDepth <= 0) {
        let meta = null;
        try {
          meta = JSON.parse(jsonLines.join('\n'));
        } catch (e) {}
        commitModel(currentId, meta);
        currentId = null;
        jsonLines = [];
        braceDepth = 0;
        inJson = false;
      }
      continue;
    }

    if (trimmed.startsWith('{') && currentId) {
      inJson = true;
      jsonLines = [rawLine];
      braceDepth = 0;
      for (const ch of rawLine) {
        if (ch === '{') braceDepth += 1;
        else if (ch === '}') braceDepth -= 1;
      }
      if (braceDepth <= 0) {
        let meta = null;
        try {
          meta = JSON.parse(jsonLines.join('\n'));
        } catch (e) {}
        commitModel(currentId, meta);
        currentId = null;
        jsonLines = [];
        braceDepth = 0;
        inJson = false;
      }
      continue;
    }

    // Plain model ID line: e.g. "opencode/beam-free" or "openrouter/z-ai/glm-5.2:free"
    if (/^[a-z0-9._-]+\/[a-z0-9._:/@-]+$/i.test(trimmed)) {
      if (currentId) {
        commitModel(currentId, null);
      }
      currentId = trimmed;
    }
  }

  if (currentId) {
    commitModel(currentId, null);
  }

  return models;
}

function runOpenCodeModelsCommand(args, useIsolatedConfig = false) {
  const cmd = resolveOpenCodeCommand();
  const env = useIsolatedConfig
    ? { ...process.env, XDG_CONFIG_HOME: ISOLATED_OPENCODE_CONFIG }
    : process.env;

  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      {
        shell: isCmdWrapper(cmd),
        windowsHide: true,
        timeout: 20000,
        maxBuffer: 10 * 1024 * 1024,
        env
      },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, output: `${stdout || ''}\n${stderr || ''}`, error: err.message });
          return;
        }
        resolve({ ok: true, output: stdout || '' });
      }
    );
    child.on('error', (err) => resolve({ ok: false, output: '', error: err.message }));
  });
}

async function fetchOpenCodeModels() {
  // Try verbose first for v1.x cost metadata, then plain `models` for v2.x (bun @opencode/cli)
  const attempts = [
    { args: ['models', '--verbose', '--pure'], isolated: false },
    { args: ['models'], isolated: false },
    { args: ['models', '--verbose', '--pure'], isolated: true },
    { args: ['models'], isolated: true },
    { args: ['models', 'opencode', '--verbose', '--pure'], isolated: true },
    { args: ['models', '--pure'], isolated: true }
  ];

  for (const attempt of attempts) {
    const res = await runOpenCodeModelsCommand(attempt.args, attempt.isolated);
    if (res.ok) {
      const parsed = parseOpenCodeModelsOutput(res.output);
      if (parsed.length > 0) {
        setDiscoveredOpenCodeModels(parsed);
        const sortedEntries = getOpenCodeModelEntries();
        const freeModels = sortedEntries.filter((m) => m.isFree);
        return { models: sortedEntries, freeModels };
      }
    }
  }

  return { models: [], freeModels: [] };
}

function extractTextFromOpenCodeJsonEvent(data) {
  if (!data || typeof data !== 'object') return '';

  // opencode `run --format json` emits NDJSON events such as:
  // { type: "text", part: { text: "..." } }
  // { type: "message.part.updated", properties: { part: { type: "text", text: "..." }, delta: "..." } }
  if (typeof data.delta === 'string') return data.delta;
  if (typeof data.properties?.delta === 'string') return data.properties.delta;
  if (data.type === 'text' && typeof data.part?.text === 'string') return data.part.text;
  if (typeof data.text === 'string') return data.text;
  if (typeof data.content === 'string') return data.content;

  if (data.properties?.part?.type === 'text' && typeof data.properties.part.text === 'string') {
    return data.properties.part.text;
  }

  return '';
}

class OpenCodeService {
  constructor(options = {}) {
    this.programmingLanguage = resolveProgrammingLanguage(options.programmingLanguage);
    this.modelName = resolveOpenCodeModel(options.modelName || getDefaultOpenCodeModel());
    this.conversationHistory = [];
    this.maxHistoryLength = 20;
    this.requestQueue = [];
    this.isProcessing = false;
    this.lastRequestTime = 0;
    this.minRequestInterval = 0;
    this.maxRetries = 2;

    // Interface compat
    this.dailyTokenCount = 0;
    this.maxDailyTokens = Infinity;
    this.lastResetTime = Date.now();
    this.apiKey = '';
    this.baseUrl = '';
    this.opencodeCmd = resolveOpenCodeCommand();

    console.log(`OpenCodeService initialized using binary: ${this.opencodeCmd} (model: ${this.modelName || 'default'})`);
  }

  updateConfiguration(options = {}) {
    const previousLang = this.programmingLanguage;
    const nextLang = resolveProgrammingLanguage(options.programmingLanguage ?? this.programmingLanguage);
    const langChanged = nextLang !== previousLang;
    this.programmingLanguage = nextLang;

    const previousModel = this.modelName;
    const nextModel = resolveOpenCodeModel(options.modelName ?? this.modelName);
    const modelChanged = nextModel !== previousModel;
    this.modelName = nextModel;
    this.opencodeCmd = resolveOpenCodeCommand();

    return { apiKeyChanged: false, modelChanged, programmingLanguageChanged: langChanged };
  }

  isQuotaExhaustedError() { return false; }
  isAuthenticationError() { return false; }

  isRetryableError(error) {
    const msg = String(error?.message || '');
    return msg.includes('ENOENT') || msg.includes('spawn') || msg.includes('ECONNRESET');
  }

  _buildRunArgs(prompt) {
    const args = ['run', '--format', 'json', '--auto'];
    if (this.modelName && this.modelName !== 'opencode') {
      args.push('-m', this.modelName);
    }

    const safePrompt = typeof prompt === 'string' && prompt.length > 20000
      ? prompt.slice(prompt.length - 20000)
      : prompt;

    args.push(safePrompt);
    return args;
  }

  _spawnRun(prompt, { onChunk = null, useIsolatedConfig = false } = {}) {
    return new Promise((resolve, reject) => {
      this.opencodeCmd = resolveOpenCodeCommand();
      const args = this._buildRunArgs(prompt);
      const env = useIsolatedConfig
        ? { ...process.env, XDG_CONFIG_HOME: ISOLATED_OPENCODE_CONFIG }
        : process.env;

      let fullText = '';
      let chunkIndex = 0;
      let stderr = '';
      let stdoutBuffer = '';

      const child = spawn(this.opencodeCmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: ISOLATED_OPENCODE_WORKSPACE,
        shell: isCmdWrapper(this.opencodeCmd),
        windowsHide: true,
        env
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('OpenCode CLI (opencode) not found. Ensure opencode is installed and in PATH.'));
        } else {
          reject(err);
        }
      });

      const processLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const data = JSON.parse(trimmed);
          const textPiece = extractTextFromOpenCodeJsonEvent(data);
          if (textPiece) {
            // If event sends cumulative text, compute delta; otherwise append
            let delta = textPiece;
            if (fullText && textPiece.startsWith(fullText)) {
              delta = textPiece.slice(fullText.length);
            }
            if (delta) {
              fullText += delta;
              chunkIndex += 1;
              if (typeof onChunk === 'function') {
                onChunk({ text: delta, index: chunkIndex });
              }
            }
          }
        } catch (e) {
          if (!trimmed.startsWith('{')) {
            fullText += (fullText ? '\n' : '') + trimmed;
            chunkIndex += 1;
            if (typeof onChunk === 'function') {
              onChunk({ text: trimmed, index: chunkIndex });
            }
          }
        }
      };

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop();
        for (const line of lines) {
          processLine(line);
        }
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        if (stdoutBuffer.trim()) {
          processLine(stdoutBuffer);
        }
        if (code !== 0 && !fullText.trim()) {
          const err = new Error(`OpenCode CLI exited with code ${code}: ${stderr.slice(0, 300)}`);
          err.stderr = stderr;
          reject(err);
          return;
        }
        resolve(fullText.trim());
      });
    });
  }

  async generateText(prompt, options = {}) {
    const onChunk = typeof options.onChunk === 'function' ? options.onChunk : null;
    try {
      return await this._spawnRun(prompt, { onChunk, useIsolatedConfig: false });
    } catch (error) {
      const msg = String(error?.message || '') + ' ' + String(error?.stderr || '');
      if (msg.includes('Configuration is invalid') || msg.includes('opencode.json')) {
        return await this._spawnRun(prompt, { onChunk, useIsolatedConfig: true });
      }
      throw error;
    }
  }

  _extractText(data) {
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) {
      return data
        .filter((p) => typeof p === 'string' || p?.text)
        .map((p) => (typeof p === 'string' ? p : p.text))
        .join('\n');
    }
    return String(data || '');
  }

  async generateMultimodal(parts, options = {}) {
    const prompt = this._extractText(parts);
    return this.generateText(prompt, options);
  }

  addToHistory(role, content) {
    this.conversationHistory.push({ role, content });
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  getContextString() {
    return this.conversationHistory
      .map((e) => `${e.role}: ${e.content}`)
      .join('\n\n');
  }

  async analyzeScreenshots(imageParts, additionalContext = '', options = {}) {
    const contextString = typeof options.contextStringOverride === 'string'
      ? options.contextStringOverride
      : this.getContextString();
    const prompt = buildScreenshotAnalysisPrompt({
      contextString,
      additionalContext,
      programmingLanguage: this.programmingLanguage,
      screenshotCount: imageParts.length,
      oaModeEnabled: options.oaModeEnabled || false
    });
    const result = await this.generateText(prompt, { onChunk: options.onChunk });
    this.addToHistory('assistant', `Screenshot analysis: ${result}`);
    return result;
  }

  async analyzeScreenshot(imageBase64, additionalContext = '', options = {}) {
    return this.analyzeScreenshots(
      [{ inlineData: { mimeType: 'image/png', data: imageBase64 } }],
      additionalContext,
      options
    );
  }

  async askAiWithSessionContext(options = {}) {
    const contextString = typeof options.contextString === 'string' ? options.contextString : this.getContextString();
    const prompt = buildAskAiSessionPrompt({
      contextString,
      transcriptContext: options.transcriptContext || '',
      sessionSummary: options.sessionSummary || '',
      screenshotCount: options.screenshotCount || 0,
      mode: options.mode || 'best-next-answer',
      programmingLanguage: this.programmingLanguage,
      candidateResume: options.candidateResume || '',
      jobDescription: options.jobDescription || '',
      oaModeEnabled: options.oaModeEnabled || false
    });
    const result = await this.generateText(prompt, { onChunk: options.onChunk });
    this.addToHistory('assistant', `Ask AI: ${result}`);
    return result;
  }

  async askAiWithSessionContextAndScreenshots(imageParts, options = {}) {
    const contextString = typeof options.contextString === 'string' ? options.contextString : this.getContextString();
    const prompt = buildAskAiSessionPrompt({
      contextString,
      transcriptContext: options.transcriptContext || '',
      sessionSummary: options.sessionSummary || '',
      screenshotCount: options.screenshotCount || imageParts.length,
      mode: options.mode || 'best-next-answer',
      programmingLanguage: this.programmingLanguage,
      candidateResume: options.candidateResume || '',
      jobDescription: options.jobDescription || '',
      oaModeEnabled: options.oaModeEnabled || false
    });
    const result = await this.generateText(prompt, { onChunk: options.onChunk });
    this.addToHistory('assistant', `Ask AI: ${result}`);
    return result;
  }

  async suggestResponse(context, options = {}) {
    const contextString = typeof options.contextString === 'string' ? options.contextString : this.getContextString();
    const prompt = buildSuggestResponsePrompt({
      contextString,
      context,
      transcriptContext: options.transcriptContext || '',
      candidateResume: options.candidateResume || '',
      jobDescription: options.jobDescription || ''
    });
    return this.generateText(prompt, { onChunk: options.onChunk });
  }

  async generateMeetingNotes(options = {}) {
    const contextString = typeof options.contextString === 'string' ? options.contextString : this.getContextString();
    if (!contextString.trim()) return 'No conversation history to summarize.';
    return this.generateText(buildMeetingNotesPrompt({ contextString }), { onChunk: options.onChunk });
  }

  async generateFollowUpEmail(options = {}) {
    if (this.conversationHistory.length === 0) return 'No conversation history to create email from.';
    return this.generateText(buildFollowUpEmailPrompt({ contextString: this.getContextString() }), { onChunk: options.onChunk });
  }

  async answerQuestion(question, options = {}) {
    const contextString = typeof options.contextString === 'string' && options.contextString.trim()
      ? options.contextString
      : this.getContextString();
    const prompt = buildAnswerQuestionPrompt({
      contextString,
      question,
      programmingLanguage: this.programmingLanguage
    });
    const result = await this.generateText(prompt, { onChunk: options.onChunk });
    this.addToHistory('user', question);
    this.addToHistory('assistant', result);
    return result;
  }

  async getConversationInsights(options = {}) {
    const contextString = typeof options.contextString === 'string' ? options.contextString : this.getContextString();
    if (!contextString.trim()) return 'Not enough conversation data for insights.';
    return this.generateText(buildInsightsPrompt({ contextString }), { onChunk: options.onChunk });
  }

  dispose() {}
}

module.exports = OpenCodeService;
module.exports.isOpenCodeInstalled = isOpenCodeInstalled;
module.exports.fetchOpenCodeModels = fetchOpenCodeModels;
module.exports.parseOpenCodeModelsOutput = parseOpenCodeModelsOutput;
module.exports.extractTextFromOpenCodeJsonEvent = extractTextFromOpenCodeJsonEvent;
