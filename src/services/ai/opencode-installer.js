// ============================================================================
// OPENCODE CLI INSTALLER & AUTO-SETUP
// ============================================================================
// Resolves, downloads, installs, and initializes the OpenCode CLI (`opencode`)
// silently in the background (for packaged .exe / fresh machines) without
// requiring Node.js, npm, or manual user setup.
// ============================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const https = require('https');
const { execFile } = require('child_process');

let activeInstallPromise = null;

function getOpenCodeInstallDir() {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'opencode', 'bin');
  }
  return path.join(os.homedir(), '.local', 'bin');
}

function getOpenCodeBinaryName() {
  return process.platform === 'win32' ? 'opencode.exe' : 'opencode';
}

function getOpenCodeConfigDir() {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, 'opencode');
  }
  return path.join(os.homedir(), '.config', 'opencode');
}

function getNpmPackageForPlatform() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    return arch === 'arm64' ? 'opencode-windows-arm64' : 'opencode-windows-x64';
  }
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'opencode-darwin-arm64' : 'opencode-darwin-x64';
  }
  if (platform === 'linux') {
    return arch === 'arm64' ? 'opencode-linux-arm64' : 'opencode-linux-x64';
  }
  return null;
}

function resolveOpenCodeCommand() {
  const binName = getOpenCodeBinaryName();
  const bunBinDir = path.join(process.env.BUN_INSTALL || path.join(os.homedir(), '.bun'), 'bin');
  const candidates = [
    path.join(bunBinDir, binName),
    path.join(getOpenCodeInstallDir(), binName),
    path.join(os.homedir(), '.opencode', 'bin', binName)
  ];

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || '';
    if (appData) {
      candidates.push(
        path.join(appData, 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe'),
        path.join(appData, 'npm', 'node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe'),
        path.join(appData, 'npm', 'opencode.cmd')
      );
    }
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Search PATH explicitly so we can resolve .exe/.cmd directly
  const pathEnv = process.env.PATH || '';
  const pathEntries = pathEnv.split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];

  for (const dir of pathEntries) {
    for (const ext of exts) {
      const fullPath = path.join(dir, `opencode${ext}`);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return 'opencode';
}

function isCmdWrapper(cmdPath) {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(String(cmdPath || ''));
}

async function isOpenCodeInstalled() {
  const cmd = resolveOpenCodeCommand();
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      ['--version'],
      {
        shell: isCmdWrapper(cmd),
        windowsHide: true,
        timeout: 5000
      },
      (err) => {
        resolve(!err);
      }
    );
    child.on('error', () => resolve(false));
  });
}

function ensureInProcessPath(binDir) {
  if (!binDir) return;
  const currentPath = process.env.PATH || '';
  const parts = currentPath.split(path.delimiter).filter(Boolean);
  const normalizedTarget = binDir.toLowerCase();
  if (!parts.some((p) => p.toLowerCase() === normalizedTarget)) {
    process.env.PATH = `${binDir}${path.delimiter}${currentPath}`;
  }
}

function persistWindowsUserPath(binDir) {
  if (process.platform !== 'win32' || !binDir) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const script = [
      `$bin = '${binDir.replace(/'/g, "''")}'`,
      `$current = [Environment]::GetEnvironmentVariable('Path', 'User')`,
      `$parts = @(); if ($current) { $parts = $current -split ';' | Where-Object { $_ } }`,
      `if (-not ($parts | Where-Object { $_.TrimEnd('\\') -ieq $bin.TrimEnd('\\') })) {`,
      `  $next = (@($bin) + $parts) -join ';'`,
      `  [Environment]::SetEnvironmentVariable('Path', $next, 'User')`,
      `}`
    ].join('; ');

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 8000 },
      (err) => {
        resolve(!err);
      }
    );
  });
}

function httpsGetJson(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Scorpion-App' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        resolve(httpsGetJson(res.headers.location, redirectsLeft - 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        return;
      }
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function httpsDownloadBuffer(url, onProgress, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Scorpion-App' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        resolve(httpsDownloadBuffer(res.headers.location, onProgress, redirectsLeft - 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        return;
      }

      const totalBytes = Number.parseInt(res.headers['content-length'] || '0', 10) || 0;
      let receivedBytes = 0;
      const chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
        receivedBytes += chunk.length;
        if (typeof onProgress === 'function' && totalBytes > 0) {
          onProgress(Math.min(100, Math.round((receivedBytes / totalBytes) * 100)), receivedBytes, totalBytes);
        }
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// Pure-JS .tar.gz extractor for single binary extraction (zero external tools required)
function extractBinaryFromTarGz(tgzBuffer, targetPath) {
  const tarBuffer = zlib.gunzipSync(tgzBuffer);
  const binName = getOpenCodeBinaryName();
  let offset = 0;

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    offset += 512;

    // End of archive (all-zero block)
    if (header.every((b) => b === 0)) {
      break;
    }

    const rawName = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const rawPrefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const fullName = rawPrefix ? `${rawPrefix}/${rawName}` : rawName;
    const sizeOctal = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const fileSize = Number.parseInt(sizeOctal || '0', 8) || 0;
    const typeFlag = header[156];

    const dataEnd = offset + fileSize;
    const isRegularFile = typeFlag === 0 || typeFlag === 48; // '\0' or '0'

    if (isRegularFile && (fullName.endsWith(`/bin/${binName}`) || fullName === `bin/${binName}` || path.basename(fullName) === binName)) {
      const fileData = tarBuffer.subarray(offset, dataEnd);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, fileData);
      if (process.platform !== 'win32') {
        fs.chmodSync(targetPath, 0o755);
      }
      return targetPath;
    }

    // Advance to next 512-byte boundary
    const paddedSize = Math.ceil(fileSize / 512) * 512;
    offset += paddedSize;
  }

  throw new Error(`OpenCode binary (${binName}) not found in downloaded archive.`);
}

function initializeOpenCodeConfig() {
  const configDir = getOpenCodeConfigDir();
  fs.mkdirSync(configDir, { recursive: true });

  const jsonPath = path.join(configDir, 'opencode.json');
  const jsoncPath = path.join(configDir, 'opencode.jsonc');

  if (!fs.existsSync(jsonPath) && !fs.existsSync(jsoncPath)) {
    const initialConfig = {
      $schema: 'https://opencode.ai/config.json'
    };
    fs.writeFileSync(jsonPath, `${JSON.stringify(initialConfig, null, 2)}\n`, 'utf8');
  }

  return { configDir, jsonPath, jsoncPath };
}

async function installOpenCode({ onProgress } = {}) {
  if (activeInstallPromise) {
    return activeInstallPromise;
  }

  activeInstallPromise = (async () => {
    const emit = (stage, message, progress = null) => {
      if (typeof onProgress === 'function') {
        try {
          onProgress({ stage, message, progress });
        } catch (err) {}
      }
    };

    const pkgName = getNpmPackageForPlatform();
    if (!pkgName) {
      throw new Error(`Unsupported platform/arch for OpenCode auto-install: ${process.platform}/${process.arch}`);
    }

    emit('downloading', `Fetching OpenCode release metadata (${pkgName})...`, 5);
    const meta = await httpsGetJson(`https://registry.npmjs.org/${pkgName}/latest`);
    const tarballUrl = meta?.dist?.tarball;
    const version = meta?.version || 'latest';
    if (!tarballUrl) {
      throw new Error(`No tarball URL found for ${pkgName}.`);
    }

    emit('downloading', `Downloading OpenCode CLI v${version}...`, 10);
    const tgzBuffer = await httpsDownloadBuffer(tarballUrl, (pct) => {
      const scaled = 10 + Math.round(pct * 0.65);
      emit('downloading', `Downloading OpenCode CLI v${version}... ${pct}%`, scaled);
    });

    emit('installing', `Installing OpenCode CLI v${version}...`, 80);
    const installDir = getOpenCodeInstallDir();
    const targetPath = path.join(installDir, getOpenCodeBinaryName());
    extractBinaryFromTarGz(tgzBuffer, targetPath);

    ensureInProcessPath(installDir);
    await persistWindowsUserPath(installDir);

    emit('configuring', 'Initializing OpenCode configuration...', 90);
    initializeOpenCodeConfig();

    const verified = await isOpenCodeInstalled();
    if (!verified) {
      throw new Error(`OpenCode was extracted to ${targetPath}, but failed verification.`);
    }

    return {
      installed: true,
      version,
      path: targetPath
    };
  })();

  try {
    return await activeInstallPromise;
  } finally {
    activeInstallPromise = null;
  }
}

async function ensureOpenCodeReady({ onProgress, syncModelsFn } = {}) {
  const emit = (stage, message, progress = null, extra = {}) => {
    if (typeof onProgress === 'function') {
      try {
        onProgress({ stage, message, progress, ...extra });
      } catch (err) {}
    }
  };

  try {
    emit('checking', 'Checking OpenCode CLI installation...', 5);
    const alreadyInstalled = await isOpenCodeInstalled();

    let installResult = { installed: true, path: resolveOpenCodeCommand(), alreadyInstalled };
    if (!alreadyInstalled) {
      installResult = await installOpenCode({ onProgress });
    } else {
      const binDir = path.dirname(installResult.path);
      ensureInProcessPath(binDir);
      await persistWindowsUserPath(binDir);
      emit('configuring', 'Initializing OpenCode configuration...', 85);
      initializeOpenCodeConfig();
    }

    let modelSync = { models: [], freeModels: [] };
    if (typeof syncModelsFn === 'function') {
      emit('syncing', 'Detecting available & free OpenCode models...', 95);
      modelSync = await syncModelsFn();
    }

    const freeCount = Array.isArray(modelSync?.freeModels) ? modelSync.freeModels.length : 0;
    const totalCount = Array.isArray(modelSync?.models) ? modelSync.models.length : 0;

    emit(
      'ready',
      totalCount > 0
        ? `OpenCode ready (${freeCount} free / ${totalCount} total models)`
        : 'OpenCode CLI ready',
      100,
      {
        path: installResult.path,
        modelCount: totalCount,
        freeModelCount: freeCount
      }
    );

    return {
      success: true,
      ...installResult,
      ...modelSync
    };
  } catch (error) {
    emit('error', `OpenCode setup failed: ${error.message}`, null, { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  getOpenCodeInstallDir,
  getOpenCodeBinaryName,
  getOpenCodeConfigDir,
  getNpmPackageForPlatform,
  resolveOpenCodeCommand,
  isCmdWrapper,
  isOpenCodeInstalled,
  initializeOpenCodeConfig,
  extractBinaryFromTarGz,
  installOpenCode,
  ensureOpenCodeReady
};
