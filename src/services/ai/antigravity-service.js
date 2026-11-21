// ============================================================================
// ANTIGRAVITY CLI AI SERVICE - Open-Cluely AI Assistant
// ============================================================================
// Routes AI requests through the locally installed Antigravity CLI (agy).
// Implements persistent warm daemon (stream-json) for ultra-fast, zero-cold-boot
// token streaming in live interviews.
// ============================================================================

const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const {
  resolveProgrammingLanguage,
  getDefaultAntigravityModel,
  resolveAntigravityModel
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

function resolveAgyCommand() {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    if (localAppData) {
      const defaultAgyPath = path.join(localAppData, 'agy', 'bin', 'agy.exe');
      if (fs.existsSync(defaultAgyPath)) {
        return defaultAgyPath;
      }
    }
  }
  return 'agy';
}

class AntigravityService {
  constructor(options = {}) {
    this.programmingLanguage = resolveProgrammingLanguage(options.programmingLanguage);
    this.modelName = resolveAntigravityModel(options.modelName || getDefaultAntigravityModel());
    this.conversationHistory = [];
    this.maxHistoryLength = 20;
    this.requestQueue = [];
    this.isProcessing = false;
    this.lastRequestTime = 0;
    this.minRequestInterval = 100;
    this.maxRetries = 2;

    // Interface compat
    this.dailyTokenCount = 0;
    this.maxDailyTokens = Infinity;
    this.lastResetTime = Date.now();
    this.apiKey = '';
    this.baseUrl = '';
    this.agyCmd = resolveAgyCommand();

    // Persistent Warm Daemon State for Instant Responses
    this.daemonProcess = null;
    this.daemonReady = false;
    this.daemonInitPromise = null;
    this.activeTurn = null;

    console.log(`AntigravityService initialized using binary: ${this.agyCmd} (model: ${this.modelName})`);

    // Warm up the persistent daemon in background on startup (skip in unit test runs)
    if (process.env.NODE_ENV !== 'test') {
      this._ensureDaemon().catch((err) => {
        console.warn('[Antigravity] Daemon background warmup notice:', err.message);
      });
    }
  }

  updateConfiguration(options = {}) {
    const previousLang = this.programmingLanguage;
    const nextLang = resolveProgrammingLanguage(options.programmingLanguage ?? this.programmingLanguage);
    const langChanged = nextLang !== previousLang;
    this.programmingLanguage = nextLang;

    const previousModel = this.modelName;
    const nextModel = resolveAntigravityModel(options.modelName ?? this.modelName);
    const modelChanged = nextModel !== previousModel;
    this.modelName = nextModel;

    if (modelChanged) {
      this._killDaemon();
      this._ensureDaemon().catch(() => {});
    }

    return { apiKeyChanged: false, modelChanged, programmingLanguageChanged: langChanged };
  }

  isQuotaExhaustedError() { return false; }
  isAuthenticationError() { return false; }

  isRetryableError(error) {
    const msg = String(error?.message || '');
    return msg.includes('ENOENT') || msg.includes('spawn') || msg.includes('ECONNRESET');
  }

  _killDaemon() {
    if (this.daemonProcess && !this.daemonProcess.killed) {
      try {
        this.daemonProcess.kill();
      } catch (e) {}
    }
    this.daemonProcess = null;
    this.daemonReady = false;
    this.daemonInitPromise = null;
    if (this.activeTurn) {
      this.activeTurn.reject(new Error('Antigravity daemon terminated for reconfiguration'));
      this.activeTurn = null;
    }
  }

  _ensureDaemon() {
    if (this.daemonProcess && !this.daemonProcess.killed && this.daemonReady) {
      return Promise.resolve(this.daemonProcess);
    }

    if (this.daemonInitPromise) {
      return this.daemonInitPromise;
    }

    this.daemonInitPromise = new Promise((resolve, reject) => {
      try {
        const args = [
          '--model', this.modelName,
          '--input-format', 'stream-json',
          '--output-format', 'stream-json',
          '--disable-slash-commands'
        ];
        if (!/(?:-low|-medium|-high)$/i.test(this.modelName)) {
          args.push('--effort', 'low');
        }

        const child = spawn(this.agyCmd, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          windowsHide: true
        });

        this.daemonProcess = child;
        this.daemonReady = false;
        let stdoutBuffer = '';

        child.stdout.on('data', (chunk) => {
          stdoutBuffer += chunk.toString();
          const lines = stdoutBuffer.split('\n');
          stdoutBuffer = lines.pop(); // keep partial trailing line

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const data = JSON.parse(trimmed);
              this._handleDaemonMessage(data);
              if (data.event === 'init') {
                this.daemonReady = true;
                this.daemonInitPromise = null;
                resolve(child);
              }
            } catch (err) {
              // Ignore non-json or fragmented logs
            }
          }
        });

        child.stderr.on('data', (chunk) => {
          const msg = chunk.toString().trim();
          if (msg && !msg.includes('error: stream input message is missing')) {
            console.warn('[Antigravity stderr]:', msg.slice(0, 160));
          }
        });

        child.on('error', (err) => {
          this.daemonReady = false;
          this.daemonProcess = null;
          this.daemonInitPromise = null;
          if (this.activeTurn) {
            this.activeTurn.reject(err);
            this.activeTurn = null;
          }
          reject(err);
        });

        child.on('close', (code) => {
          this.daemonReady = false;
          this.daemonProcess = null;
          this.daemonInitPromise = null;
          if (this.activeTurn) {
            const err = new Error(`Antigravity daemon exited with code ${code}`);
            this.activeTurn.reject(err);
            this.activeTurn = null;
          }
        });
      } catch (err) {
        this.daemonInitPromise = null;
        reject(err);
      }
    });

    return this.daemonInitPromise;
  }

  _handleDaemonMessage(data) {
    if (!this.activeTurn) return;

    if (data.event === 'step_update') {
      const step = data.step_update;
      const delta = step?.text_delta;
      if (delta) {
        this.activeTurn.fullText += delta;
        this.activeTurn.chunkIndex += 1;
        if (!this.activeTurn.firstChunkSent) {
          this.activeTurn.firstChunkSent = true;
        }
        if (typeof this.activeTurn.onChunk === 'function') {
          this.activeTurn.onChunk({
            text: delta,
            index: this.activeTurn.chunkIndex
          });
        }
      }
    } else if (data.event === 'result') {
      const response = data.result?.response || this.activeTurn.fullText || '';
      if (data.result?.status === 'ERROR' && !response) {
        this.activeTurn.reject(new Error(data.result?.error || 'Antigravity execution failed'));
      } else {
        this.activeTurn.resolve(response.trim());
      }
      this.activeTurn = null;
    }
  }

  async _runDaemonTurn(prompt, request) {
    await this._ensureDaemon();
    return new Promise((resolve, reject) => {
      this.activeTurn = {
        prompt,
        fullText: '',
        chunkIndex: 0,
        firstChunkSent: false,
        onChunk: request?.onChunk || null,
        resolve,
        reject
      };

      const payload = JSON.stringify({
        event: 'user',
        message: { content: prompt }
      }) + '\n';

      this.daemonProcess.stdin.write(payload);
    });
  }

  async waitForRateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
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
        const result = await this._executeRequest(req);
        req.resolve(result);
      } catch (err) {
        req.reject(err);
      }
    }
    this.isProcessing = false;
  }

  async _executeRequest(request, retryCount = 0) {
    const prompt = typeof request.data === 'string'
      ? request.data
      : this._extractText(request.data);

    // Fast-path: Execute via persistent warm stream-json daemon
    try {
      return await this._runDaemonTurn(prompt, request);
    } catch (daemonError) {
      console.warn('[Antigravity] Daemon turn error, falling back to one-shot CLI:', daemonError.message);
      if (request._firstChunkSent) throw daemonError;
      if (typeof request.onChunk === 'function') {
        return await this._runStreaming(prompt, request);
      }
      return await this._run(prompt);
    }
  }

  _extractText(data) {
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) {
      return data
        .filter(p => typeof p === 'string' || p?.text)
        .map(p => (typeof p === 'string' ? p : p.text))
        .join('\n');
    }
    return String(data || '');
  }

  _buildAgyArgs(prompt) {
    const args = [];
    if (this.modelName && this.modelName !== 'antigravity') {
      args.push('--model', this.modelName);
    }
    args.push('--disable-slash-commands');
    if (!/(?:-low|-medium|-high)$/i.test(this.modelName)) {
      args.push('--effort', 'low');
    }

    const safePrompt = typeof prompt === 'string' && prompt.length > 25000
      ? prompt.slice(prompt.length - 25000)
      : prompt;

    args.push('--print', safePrompt, '--output-format', 'text');
    return args;
  }

  async _run(prompt) {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const args = this._buildAgyArgs(prompt);
      const child = spawn(this.agyCmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('Antigravity CLI (agy) not found. Ensure agy is installed and in PATH.'));
        } else {
          reject(err);
        }
      });

      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      child.on('close', (code) => {
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(`Antigravity CLI exited with code ${code}: ${stderr.slice(0, 300)}`));
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  async _runStreaming(prompt, request) {
    return new Promise((resolve, reject) => {
      let fullText = '';
      let chunkIndex = 0;
      let stderr = '';

      const args = this._buildAgyArgs(prompt);
      const child = spawn(this.agyCmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('Antigravity CLI (agy) not found. Ensure agy is installed and in PATH.'));
        } else {
          reject(err);
        }
      });

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        if (text) {
          fullText += text;
          chunkIndex += 1;
          if (!request._firstChunkSent) request._firstChunkSent = true;
          request.onChunk({ text, index: chunkIndex });
        }
      });

      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      child.on('close', (code) => {
        if (code !== 0 && !fullText) {
          reject(new Error(`Antigravity CLI exited with code ${code}: ${stderr.slice(0, 300)}`));
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
    return this.conversationHistory
      .map(e => `${e.role}: ${e.content}`)
      .join('\n\n');
  }

  async generateText(prompt, options = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        type: 'text',
        data: prompt,
        resolve,
        reject,
        onChunk: typeof options.onChunk === 'function' ? options.onChunk : null
      });
      this.processQueue();
    });
  }

  async generateMultimodal(parts, options = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        type: 'multimodal',
        data: parts,
        resolve,
        reject,
        onChunk: typeof options.onChunk === 'function' ? options.onChunk : null
      });
      this.processQueue();
    });
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
    const prompt = buildAnswerQuestionPrompt({
      contextString: this.getContextString(),
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

  dispose() {
    this._killDaemon();
  }
}

// Utility: check if agy CLI is installed
async function isAntigravityInstalled() {
  const cmd = resolveAgyCommand();
  return new Promise((resolve) => {
    const child = execFile(cmd, ['--version'], { shell: process.platform === 'win32', windowsHide: true }, (err) => {
      resolve(!err);
    });
    child.on('error', () => resolve(false));
  });
}

module.exports = AntigravityService;
module.exports.isAntigravityInstalled = isAntigravityInstalled;
