// ============================================================================
// CLI AGENT SERVICE - Open-Cluely AI Assistant
// ============================================================================
// Generic wrapper for coding agent CLIs: codex, claude (Claude Code), etc.
// Implements the same public interface as GeminiService / OllamaService.
// ============================================================================

const { spawn, execFile } = require('child_process');
const { resolveProgrammingLanguage } = require('../../config');
const {
  buildAnswerQuestionPrompt,
  buildAskAiSessionPrompt,
  buildFollowUpEmailPrompt,
  buildInsightsPrompt,
  buildMeetingNotesPrompt,
  buildScreenshotAnalysisPrompt,
  buildSuggestResponsePrompt
} = require('./prompts');

// Map of supported CLI agent commands
const CLI_AGENTS = {
  codex: { cmd: 'codex', args: ['--non-interactive'], name: 'OpenAI Codex' },
  'claude-code': { cmd: 'claude', args: ['--print'], name: 'Claude Code' },
  custom: { cmd: null, args: [], name: 'Custom CLI Agent' }
};

class CliAgentService {
  constructor(options = {}) {
    this.agentType = options.agentType || 'codex';
    this.customCmd = options.customCmd || '';
    this.customArgs = Array.isArray(options.customArgs) ? options.customArgs : [];
    this.programmingLanguage = resolveProgrammingLanguage(options.programmingLanguage);

    this.conversationHistory = [];
    this.maxHistoryLength = 20;
    this.requestQueue = [];
    this.isProcessing = false;
    this.lastRequestTime = 0;
    this.minRequestInterval = 500;
    this.maxRetries = 2;

    // Interface compat
    this.dailyTokenCount = 0;
    this.maxDailyTokens = Infinity;
    this.lastResetTime = Date.now();
    this.apiKey = '';
    this.modelName = this.agentType;

    const agentConfig = CLI_AGENTS[this.agentType] || CLI_AGENTS.custom;
    this.cliCmd = this.agentType === 'custom' ? this.customCmd : agentConfig.cmd;
    this.cliArgs = this.agentType === 'custom' ? this.customArgs : agentConfig.args;
    this.agentName = agentConfig.name;

    console.log(`CliAgentService initialized: ${this.agentName} (${this.cliCmd})`);
  }

  updateConfiguration(options = {}) {
    const prevLang = this.programmingLanguage;
    if (options.agentType && options.agentType !== this.agentType) {
      this.agentType = options.agentType;
      const cfg = CLI_AGENTS[this.agentType] || CLI_AGENTS.custom;
      this.cliCmd = this.agentType === 'custom' ? (options.customCmd || this.customCmd) : cfg.cmd;
      this.cliArgs = this.agentType === 'custom' ? (options.customArgs || this.customArgs) : cfg.args;
      this.agentName = cfg.name;
      this.modelName = this.agentType;
    }
    if (options.customCmd) this.customCmd = options.customCmd;
    this.programmingLanguage = resolveProgrammingLanguage(options.programmingLanguage ?? this.programmingLanguage);
    return { apiKeyChanged: false, modelChanged: false, programmingLanguageChanged: this.programmingLanguage !== prevLang };
  }

  isQuotaExhaustedError() { return false; }
  isAuthenticationError() { return false; }

  isRetryableError(error) {
    const msg = String(error?.message || '');
    return msg.includes('ENOENT') || msg.includes('spawn') || msg.includes('timeout');
  }

  async waitForRateLimit() {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.minRequestInterval) {
      await new Promise(r => setTimeout(r, this.minRequestInterval - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) return;
    this.isProcessing = true;
    while (this.requestQueue.length > 0) {
      const req = this.requestQueue.shift();
      try {
        await this.waitForRateLimit();
        req.resolve(await this._executeRequest(req));
      } catch (err) {
        req.reject(err);
      }
    }
    this.isProcessing = false;
  }

  async _executeRequest(request, retryCount = 0) {
    try {
      const prompt = typeof request.data === 'string'
        ? request.data
        : this._extractText(request.data);

      if (typeof request.onChunk === 'function') {
        return await this._runStreaming(prompt, request);
      }
      return await this._run(prompt);
    } catch (error) {
      console.error(`[CliAgent:${this.agentType}] Error (attempt ${retryCount + 1}):`, error.message);
      if (request._firstChunkSent) throw error;
      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        await new Promise(r => setTimeout(r, Math.pow(2, retryCount) * 500));
        return this._executeRequest(request, retryCount + 1);
      }
      throw error;
    }
  }

  _extractText(data) {
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) {
      return data.filter(p => typeof p === 'string' || p?.text).map(p => typeof p === 'string' ? p : p.text).join('\n');
    }
    return String(data || '');
  }

  _buildSpawnArgs(prompt) {
    if (!this.cliCmd) throw new Error('No CLI command configured for custom agent.');
    // For codex: codex --non-interactive "prompt"
    // For claude-code: claude --print "prompt"
    return [...this.cliArgs, prompt];
  }

  async _run(prompt) {
    return new Promise((resolve, reject) => {
      if (!this.cliCmd) {
        return reject(new Error('No CLI command configured. Set a custom command in settings.'));
      }

      let stdout = '';
      let stderr = '';
      const args = this._buildSpawnArgs(prompt);

      console.log(`[CliAgent] Running: ${this.cliCmd} ${args.slice(0, -1).join(' ')} "<prompt>"`);

      const child = spawn(this.cliCmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        windowsHide: true
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error(`CLI agent "${this.cliCmd}" not found on PATH. Install ${this.agentName} and ensure it is in PATH.`));
        } else {
          reject(err);
        }
      });

      child.stdout.on('data', c => { stdout += c.toString(); });
      child.stderr.on('data', c => { stderr += c.toString(); });

      child.on('close', (code) => {
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(`${this.agentName} CLI exited with code ${code}: ${stderr.slice(0, 300)}`));
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  async _runStreaming(prompt, request) {
    return new Promise((resolve, reject) => {
      if (!this.cliCmd) {
        return reject(new Error('No CLI command configured.'));
      }

      let fullText = '';
      let chunkIndex = 0;
      let stderr = '';
      const args = this._buildSpawnArgs(prompt);

      const child = spawn(this.cliCmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        windowsHide: true
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error(`CLI agent "${this.cliCmd}" not found on PATH.`));
        } else {
          reject(err);
        }
      });

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        if (text) {
          fullText += text;
          chunkIndex++;
          if (!request._firstChunkSent) request._firstChunkSent = true;
          request.onChunk({ text, index: chunkIndex });
        }
      });

      child.stderr.on('data', c => { stderr += c.toString(); });

      child.on('close', (code) => {
        if (code !== 0 && !fullText) {
          reject(new Error(`${this.agentName} CLI exited with code ${code}: ${stderr.slice(0, 300)}`));
          return;
        }
        resolve(fullText.trim());
      });
    });
  }

  addToHistory(role, content) {
    this.conversationHistory.push({ role, content });
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
    }
  }

  clearHistory() { this.conversationHistory = []; }

  getContextString() {
    return this.conversationHistory.map(e => `${e.role}: ${e.content}`).join('\n\n');
  }

  async generateText(prompt, options = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ type: 'text', data: prompt, resolve, reject, onChunk: typeof options.onChunk === 'function' ? options.onChunk : null });
      this.processQueue();
    });
  }

  async generateMultimodal(parts, options = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ type: 'multimodal', data: parts, resolve, reject, onChunk: typeof options.onChunk === 'function' ? options.onChunk : null });
      this.processQueue();
    });
  }

  async analyzeScreenshots(imageParts, additionalContext = '', options = {}) {
    const contextString = typeof options.contextStringOverride === 'string' ? options.contextStringOverride : this.getContextString();
    const prompt = buildScreenshotAnalysisPrompt({ contextString, additionalContext, programmingLanguage: this.programmingLanguage, screenshotCount: imageParts.length });
    const result = await this.generateText(`${prompt}\n\n[Note: ${imageParts.length} screenshot(s) captured. CLI mode — no image data forwarded.]`, { onChunk: options.onChunk });
    this.addToHistory('assistant', `Screenshot analysis: ${result}`);
    return result;
  }

  async analyzeScreenshot(imageBase64, additionalContext = '') {
    return this.analyzeScreenshots([{ inlineData: { mimeType: 'image/png', data: imageBase64 } }], additionalContext);
  }

  async askAiWithSessionContext(options = {}) {
    const contextString = typeof options.contextString === 'string' ? options.contextString : this.getContextString();
    const prompt = buildAskAiSessionPrompt({ contextString, transcriptContext: options.transcriptContext || '', sessionSummary: options.sessionSummary || '', screenshotCount: options.screenshotCount || 0, mode: options.mode || 'best-next-answer' });
    const result = await this.generateText(prompt, { onChunk: options.onChunk });
    this.addToHistory('assistant', `Ask AI: ${result}`);
    return result;
  }

  async askAiWithSessionContextAndScreenshots(imageParts, options = {}) {
    const contextString = typeof options.contextString === 'string' ? options.contextString : this.getContextString();
    const prompt = buildAskAiSessionPrompt({ contextString, transcriptContext: options.transcriptContext || '', sessionSummary: options.sessionSummary || '', screenshotCount: options.screenshotCount || imageParts.length, mode: options.mode || 'best-next-answer' });
    const result = await this.generateText(`${prompt}\n\n[Note: ${imageParts.length} screenshot(s) not forwarded to CLI.]`, { onChunk: options.onChunk });
    this.addToHistory('assistant', `Ask AI: ${result}`);
    return result;
  }

  async suggestResponse(context, options = {}) {
    const contextString = typeof options.contextString === 'string' ? options.contextString : this.getContextString();
    return this.generateText(buildSuggestResponsePrompt({ contextString, context }), { onChunk: options.onChunk });
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
    const prompt = buildAnswerQuestionPrompt({ contextString: this.getContextString(), question, programmingLanguage: this.programmingLanguage });
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
}

// Check if a CLI agent is available on PATH
async function isCliAgentInstalled(agentType) {
  const cfg = CLI_AGENTS[agentType];
  if (!cfg || !cfg.cmd) return false;
  return new Promise((resolve) => {
    const child = execFile(cfg.cmd, ['--version'], { shell: process.platform === 'win32', windowsHide: true }, (err) => {
      resolve(!err);
    });
    child.on('error', () => resolve(false));
  });
}

module.exports = CliAgentService;
module.exports.isCliAgentInstalled = isCliAgentInstalled;
module.exports.CLI_AGENTS = CLI_AGENTS;
