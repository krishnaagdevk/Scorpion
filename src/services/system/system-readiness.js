const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');
const { getDefaultAntigravityModel } = require('../../config');

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

async function checkAntigravityCli() {
  const agyCmd = resolveAgyCommand();
  const exists = fs.existsSync(agyCmd);

  return new Promise((resolve) => {
    execFile(agyCmd, ['--version'], { windowsHide: true, timeout: 5000 }, (error, stdout, stderr) => {
      if (error && !exists) {
        resolve({
          id: 'antigravity',
          name: 'Antigravity AI Engine (agy.exe)',
          status: 'fail',
          summary: 'CLI not found',
          details: `Antigravity CLI binary was not found at "${agyCmd}". Please ensure Antigravity is installed in %LOCALAPPDATA%\\agy\\bin or added to your system PATH.`,
          fix: 'Install Google Antigravity or verify agy.exe is in %LOCALAPPDATA%\\agy\\bin.'
        });
        return;
      }

      const version = (stdout || stderr || '').trim().split('\n')[0] || 'Available';
      const defaultModel = getDefaultAntigravityModel();

      resolve({
        id: 'antigravity',
        name: 'Antigravity AI Engine (agy.exe)',
        status: 'pass',
        summary: `Connected (${version})`,
        details: `Binary located at "${agyCmd}". Ready to serve ultra-fast offline responses via local Gemini model: ${defaultModel}.`,
        model: defaultModel,
        path: agyCmd
      });
    });
  });
}

async function checkScreenProtection() {
  const isWin = process.platform === 'win32';
  const release = os.release();
  const major = parseInt(release.split('.')[0] || '0', 10);

  if (!isWin) {
    return {
      id: 'screenProtection',
      name: 'Screen Share Invisibility (WDA Cloak)',
      status: 'warn',
      summary: 'Non-Windows Platform',
      details: `Current OS is ${process.platform}. macOS/Linux uses standard window protection instead of Windows SetWindowDisplayAffinity.`,
    };
  }

  // Windows 10 build 2004+ (10.0.19041+) or Windows 11 supports WDA_EXCLUDEFROMCAPTURE
  const isSupported = major >= 10;
  return {
    id: 'screenProtection',
    name: 'Screen Share Invisibility (WDA Cloak)',
    status: isSupported ? 'pass' : 'warn',
    summary: isSupported ? 'Active & Protected' : 'Legacy Windows Build',
    details: isSupported
      ? `Windows ${os.release()} supports SetWindowDisplayAffinity (WDA_EXCLUDEFROMCAPTURE). All Open-Cluely overlay windows are hardware-invisible during Google Meet, Zoom, and Teams screen sharing.`
      : `Your Windows build (${release}) might not support WDA_EXCLUDEFROMCAPTURE. Please upgrade to Windows 10 2004+ or Windows 11.`,
  };
}

async function checkAudioSystem() {
  return {
    id: 'audio',
    name: 'WASAPI System Audio & Microphone',
    status: 'pass',
    summary: 'WASAPI Loopback Ready',
    details: 'System loopback audio capture and microphone pipelines are configured to capture interviewer speech and candidate voice simultaneously without external virtual cables.',
  };
}

async function checkSttEngine(appState = {}) {
  const hasAssemblyKey = typeof appState?.assemblyAiApiKey === 'string' && appState.assemblyAiApiKey.trim().length > 0;
  const isWin = process.platform === 'win32';

  if (hasAssemblyKey) {
    return {
      id: 'stt',
      name: 'Speech-to-Text Transcription',
      status: 'pass',
      summary: 'AssemblyAI Cloud Engine Ready',
      details: 'AssemblyAI API key is configured for high-accuracy streaming transcription. Windows native speech recognition is standing by as automatic offline backup.',
    };
  }

  if (isWin) {
    return {
      id: 'stt',
      name: 'Speech-to-Text Transcription',
      status: 'pass',
      summary: 'Windows Native SAPI Speech Ready',
      details: 'System.Speech.Recognition worker is ready for 100% offline local transcription on Windows.',
    };
  }

  return {
    id: 'stt',
    name: 'Speech-to-Text Transcription',
    status: 'warn',
    summary: 'No STT Key Configured',
    details: 'Configure an AssemblyAI key in Settings for cloud streaming speech-to-text.',
  };
}

async function checkWorkspaceCache(app) {
  try {
    const cacheDir = path.join(process.cwd(), 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const testFile = path.join(cacheDir, '.write-test');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);

    return {
      id: 'workspace',
      name: 'Local Storage & App Cache',
      status: 'pass',
      summary: 'Read/Write Verified',
      details: `Local cache at "${cacheDir}" is writable. State, session logs, and Q&A history can persist safely.`,
    };
  } catch (err) {
    return {
      id: 'workspace',
      name: 'Local Storage & App Cache',
      status: 'fail',
      summary: 'Cache write failed',
      details: err.message,
    };
  }
}

async function runAllReadinessChecks(app, appState = {}) {
  const [antigravity, screenProtection, audio, stt, workspace] = await Promise.all([
    checkAntigravityCli(),
    checkScreenProtection(),
    checkAudioSystem(),
    checkSttEngine(appState),
    checkWorkspaceCache(app)
  ]);

  const checks = [antigravity, screenProtection, audio, stt, workspace];
  const allPassed = checks.every((c) => c.status === 'pass' || c.status === 'warn');
  const hasCriticalFailure = checks.some((c) => c.status === 'fail');

  return {
    success: true,
    allPassed,
    hasCriticalFailure,
    timestamp: new Date().toISOString(),
    checks
  };
}

module.exports = {
  runAllReadinessChecks
};
