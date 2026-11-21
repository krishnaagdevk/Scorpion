'use strict';

// Build launcher. electron-builder spawns helpers that misbehave when
// ELECTRON_RUN_AS_NODE is inherited from the shell, so we strip it here too.
// Detects the current platform and picks a sensible default target.

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const rawArgs = process.argv.slice(2);

// Normalize user-supplied shorthand words like 'win', 'windows', 'mac', 'linux'
const normalizedUserArgs = [];
let platformOverride = null;

for (const arg of rawArgs) {
  const lower = arg.toLowerCase().replace(/^-+/, '');
  if (lower === 'win' || lower === 'windows') {
    platformOverride = 'win32';
  } else if (lower === 'mac' || lower === 'darwin' || lower === 'macos') {
    platformOverride = 'darwin';
  } else if (lower === 'linux') {
    platformOverride = 'linux';
  } else {
    normalizedUserArgs.push(arg);
  }
}

const targetPlatform = platformOverride || os.platform();
const platformArgs = (() => {
  switch (targetPlatform) {
    case 'win32':  return ['--win', 'portable'];
    case 'darwin': return ['--mac'];
    case 'linux':  return ['--linux'];
    default:       return [];
  }
})();

// Avoid duplicate platform flags if already present in user args
const hasExplicitPlatform = normalizedUserArgs.some(a =>
  a.startsWith('--win') || a.startsWith('--mac') || a.startsWith('--linux')
);
const finalPlatformArgs = hasExplicitPlatform ? [] : platformArgs;

const args = [...finalPlatformArgs, ...normalizedUserArgs];

// Invoke electron-builder via Node directly to avoid spawning the .cmd
// shim on Windows (which needs shell:true and triggers a deprecation
// warning). The CLI module path is stable across versions.
const builderCli = require.resolve('electron-builder/out/cli/cli.js');
const child = spawn(process.execPath, [builderCli, ...args], {
  stdio: 'inherit',
  env
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error('[run-build] Failed to spawn electron-builder:', err.message);
  process.exit(1);
});
