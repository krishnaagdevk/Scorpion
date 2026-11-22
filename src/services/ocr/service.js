'use strict';

const fs = require('fs');

let tesseractModule = null;
function getCreateWorker() {
  if (!tesseractModule) {
    try {
      tesseractModule = require('tesseract.js');
    } catch (err) {
      console.warn('OCR tesseract.js not available:', err.message);
      return null;
    }
  }
  return tesseractModule?.createWorker || null;
}

const OCR_IDLE_TIMEOUT_MS = 45000; // Free ~150MB worker memory after 45s of idle

function createOcrService({
  createWorker: createWorkerFactory,
  fsModule = fs
} = {}) {
  let workerPromise = null;
  let idleTimer = null;

  function resetIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }

    idleTimer = setTimeout(() => {
      dispose().catch((err) => {
        console.warn('OCR idle worker termination notice:', err.message);
      });
    }, OCR_IDLE_TIMEOUT_MS);

    if (idleTimer.unref) {
      idleTimer.unref();
    }
  }

  async function getWorker() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }

    if (!workerPromise) {
      const factory = createWorkerFactory || getCreateWorker();
      if (!factory) {
        throw new Error('OCR worker factory is not available');
      }
      workerPromise = factory('eng').catch((error) => {
        workerPromise = null;
        throw error;
      });
    }

    return workerPromise;
  }

  async function extractTextFromEntries(entries = []) {
    const usableEntries = Array.isArray(entries)
      ? entries.filter((entry) => entry && typeof entry.path === 'string')
      : [];

    if (usableEntries.length === 0) {
      return '';
    }

    let worker;
    try {
      worker = await getWorker();
    } catch (err) {
      console.warn('OCR processing skipped (worker unavailable):', err.message);
      return '';
    }

    const textParts = [];

    try {
      for (const entry of usableEntries) {
        if (!fsModule.existsSync(entry.path)) {
          throw new Error(`Screenshot file not found for OCR: ${entry.path}`);
        }

        const result = await worker.recognize(fsModule.readFileSync(entry.path));
        const text = String(result?.data?.text || '').trim();

        if (text) {
          textParts.push(`[Screenshot ${entry.id || 'unknown'}]\n${text}`);
        }
      }
    } finally {
      resetIdleTimer();
    }

    return textParts.join('\n\n');
  }

  async function dispose() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }

    if (!workerPromise) {
      return;
    }

    const currentWorkerPromise = workerPromise;
    workerPromise = null;
    const worker = await currentWorkerPromise;
    if (worker && typeof worker.terminate === 'function') {
      await worker.terminate();
    }
  }

  return {
    dispose,
    extractTextFromEntries
  };
}

module.exports = {
  createOcrService
};
