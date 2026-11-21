const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');

class WindowsSpeechService extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.activeSource = null;
    this.scriptPath = path.join(__dirname, 'windows-speech-worker.ps1');
  }

  start(source = 'mic') {
    if (this.process) {
      console.log(`[WindowsSpeech] Already running for source ${this.activeSource}`);
      return { success: true, message: 'Already running' };
    }

    this.activeSource = source;
    const args = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', this.scriptPath
    ];

    console.log(`[WindowsSpeech] Spawning speech recognition for ${source}`);
    this.emit('status', { source, status: 'connecting', message: 'Starting Windows Speech Recognition...' });

    try {
      this.process = spawn('powershell.exe', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      this.process.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        const lines = text.split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          if (line.startsWith('[STATUS]')) {
            const statusVal = line.replace('[STATUS]', '').trim();
            this.emit('status', { source: this.activeSource, status: statusVal });
          } else if (line.startsWith('[FINAL]')) {
            const transcript = line.replace('[FINAL]', '').trim();
            if (transcript) {
              this.emit('final', { source: this.activeSource, text: transcript });
            }
          } else if (line.startsWith('[PARTIAL]')) {
            const transcript = line.replace('[PARTIAL]', '').trim();
            if (transcript) {
              this.emit('partial', { source: this.activeSource, text: transcript });
            }
          } else if (line.startsWith('[ERROR]')) {
            const err = line.replace('[ERROR]', '').trim();
            this.emit('error', { source: this.activeSource, error: err });
          }
        }
      });

      this.process.stderr.on('data', (chunk) => {
        console.error('[WindowsSpeech:stderr]', chunk.toString().trim());
      });

      this.process.on('close', (code) => {
        console.log(`[WindowsSpeech] Process exited with code ${code}`);
        const endedSource = this.activeSource;
        this.process = null;
        this.activeSource = null;
        this.emit('stopped', { source: endedSource });
      });

      this.process.on('error', (err) => {
        console.error('[WindowsSpeech] Process error:', err);
        const errSource = this.activeSource;
        this.process = null;
        this.activeSource = null;
        this.emit('error', { source: errSource, error: err.message });
      });

      return { success: true };
    } catch (err) {
      console.error('[WindowsSpeech] Failed to start:', err);
      this.emit('error', { source, error: err.message });
      this.process = null;
      this.activeSource = null;
      return { success: false, error: err.message };
    }
  }

  stop(source = null) {
    if (!this.process) return { success: true };
    console.log(`[WindowsSpeech] Stopping recognition for ${this.activeSource}`);
    try {
      this.process.stdin.write('STOP\r\n');
      setTimeout(() => {
        if (this.process) {
          try { this.process.kill(); } catch (_) {}
          this.process = null;
          this.activeSource = null;
        }
      }, 1000);
    } catch (_) {
      if (this.process) {
        try { this.process.kill(); } catch (_) {}
        this.process = null;
        this.activeSource = null;
      }
    }
    return { success: true };
  }

  isActive() {
    return Boolean(this.process);
  }
}

module.exports = {
  WindowsSpeechService,
  windowsSpeechService: new WindowsSpeechService()
};
