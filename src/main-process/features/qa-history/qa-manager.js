const fs = require('fs');
const path = require('path');
const { createQaHistoryWindow } = require('../../../windows/qa-history/window');

function createQaManager({ app, screen, getAppEnvironment, getInitialOpacity, getInitialClickThrough }) {
  let qaWindow = null;
  let qaHistory = [];
  const historyPath = path.join(process.cwd(), 'cache', 'qa-history.json');

  // Load persisted history
  try {
    if (fs.existsSync(historyPath)) {
      const raw = fs.readFileSync(historyPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        qaHistory = parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load qa-history cache:', err.message);
    qaHistory = [];
  }

  function persistHistory() {
    try {
      const cacheDir = path.dirname(historyPath);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(historyPath, JSON.stringify(qaHistory.slice(-100), null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to persist qa-history:', err.message);
    }
  }

  function ensureQaWindowCreated() {
    if (qaWindow && !qaWindow.isDestroyed()) {
      return qaWindow;
    }

    try {
      const appEnv = typeof getAppEnvironment === 'function' ? getAppEnvironment() : {};
      const initialOpacity = typeof getInitialOpacity === 'function' ? getInitialOpacity() : 1;
      const initialClickThrough = typeof getInitialClickThrough === 'function' ? getInitialClickThrough() : false;
      qaWindow = createQaHistoryWindow({
        app,
        screen,
        hideFromScreenCapture: true,
        initialOpacity,
        initialClickThrough,
        autoShow: false,
        onClosed: () => {
          qaWindow = null;
        }
      });
    } catch (err) {
      // In unit test runner / headless environments without full Electron BrowserWindow
    }

    return qaWindow;
  }

  function sendToQaWindow(channel, data) {
    if (qaWindow && !qaWindow.isDestroyed() && qaWindow.webContents) {
      try {
        if (qaWindow.webContents.isLoading && qaWindow.webContents.isLoading()) {
          qaWindow.webContents.once('did-finish-load', () => {
            try {
              if (qaWindow && !qaWindow.isDestroyed() && qaWindow.webContents) {
                qaWindow.webContents.send(channel, data);
              }
            } catch (err) {}
          });
          return;
        }
        qaWindow.webContents.send(channel, data);
      } catch (err) {
        console.error(`Failed to send to QA window [${channel}]:`, err.message);
      }
    }
  }

  function openQaWindow() {
    if (qaWindow && !qaWindow.isDestroyed()) {
      try {
        if (qaWindow.isMinimized && qaWindow.isMinimized()) {
          qaWindow.restore();
        }
        qaWindow.showInactive();
      } catch (err) {}
      return qaWindow;
    }

    try {
      const appEnv = typeof getAppEnvironment === 'function' ? getAppEnvironment() : {};
      const initialOpacity = typeof getInitialOpacity === 'function' ? getInitialOpacity() : 1;
      const initialClickThrough = typeof getInitialClickThrough === 'function' ? getInitialClickThrough() : false;
      qaWindow = createQaHistoryWindow({
        app,
        screen,
        hideFromScreenCapture: true,
        initialOpacity,
        initialClickThrough,
        autoShow: true,
        onClosed: () => {
          qaWindow = null;
        }
      });
    } catch (err) {}

    return qaWindow;
  }

  function closeQaWindow() {
    if (qaWindow && !qaWindow.isDestroyed()) {
      try {
        qaWindow.hide();
      } catch (err) {
        try {
          qaWindow.destroy();
        } catch (closeErr) {}
        qaWindow = null;
      }
    }
  }

  function toggleQaWindow(forceState) {
    if (forceState === true) {
      return openQaWindow();
    }
    if (forceState === false) {
      closeQaWindow();
      return null;
    }

    if (qaWindow && !qaWindow.isDestroyed() && qaWindow.isVisible()) {
      closeQaWindow();
      return null;
    }
    return openQaWindow();
  }

  function recordQuestion({ question, source = 'voice', sessionSummary = '' }) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const item = {
      id,
      question: String(question || '').trim(),
      answer: '',
      source,
      hasCode: false,
      sessionSummary,
      timestamp: new Date().toISOString(),
      status: 'evaluating'
    };

    qaHistory.push(item);
    if (qaHistory.length > 100) {
      qaHistory = qaHistory.slice(-100);
    }

    persistHistory();

    // Automatically display separate stealth window for candidate
    try {
      openQaWindow();
    } catch (err) {}

    sendToQaWindow('qa-history-item-added', item);
    return id;
  }

  function appendChunk(id, chunk) {
    const item = qaHistory.find(i => i.id === id);
    if (!item) return;

    item.answer = (item.answer || '') + (chunk || '');
    sendToQaWindow('qa-history-answer-chunk', { id, chunk });
  }

  function finalizeAnswer(id, answer) {
    const item = qaHistory.find(i => i.id === id);
    if (!item) return;

    item.answer = answer || item.answer;
    item.status = 'completed';
    item.hasCode = /```/.test(item.answer);

    const aiQMatch = item.answer.match(/(?:\*{0,2}🎯\s*Question:\*{0,2}|🎯\s*Question:?)\s*([^\n\r]+)/i);
    if (aiQMatch && aiQMatch[1] && aiQMatch[1].trim().length > 3) {
      item.identifiedQuestion = aiQMatch[1].trim();
    }

    persistHistory();

    try {
      openQaWindow();
    } catch (err) {}

    sendToQaWindow('qa-history-answer-complete', {
      id,
      answer: item.answer,
      identifiedQuestion: item.identifiedQuestion
    });
  }

  function getHistory() {
    return [...qaHistory];
  }

  function clearHistory() {
    qaHistory = [];
    persistHistory();
    sendToQaWindow('qa-history-cleared');
    return { success: true };
  }

  function deleteItem(id) {
    qaHistory = qaHistory.filter(i => String(i.id) !== String(id));
    persistHistory();
    return { success: true };
  }

  function restoreItems(items = []) {
    if (Array.isArray(items) && items.length > 0) {
      const existingIds = new Set(qaHistory.map(i => String(i.id)));
      for (const it of items) {
        if (!existingIds.has(String(it.id))) {
          qaHistory.unshift(it);
          existingIds.add(String(it.id));
        }
      }
      persistHistory();
      return { success: true, count: qaHistory.length };
    }
    return { success: false };
  }

  function registerIpc(ipcMain) {
    ipcMain.handle('close-qa-window', () => {
      closeQaWindow();
      return { success: true, isOpen: false };
    });

    ipcMain.handle('toggle-qa-window', (_event, forceState) => {
      const win = toggleQaWindow(forceState);
      return { success: true, isOpen: Boolean(win) };
    });

    ipcMain.handle('get-qa-history', () => {
      return getHistory();
    });

    ipcMain.handle('clear-qa-history', () => {
      return clearHistory();
    });

    ipcMain.handle('delete-qa-item', (_event, id) => {
      return deleteItem(id);
    });

    ipcMain.handle('restore-qa-items', (_event, items) => {
      return restoreItems(items);
    });

    ipcMain.handle('qa-window-toggle-pin', (_event, enabled) => {
      if (qaWindow && !qaWindow.isDestroyed()) {
        qaWindow.setAlwaysOnTop(Boolean(enabled));
      }
      return { success: true };
    });

    ipcMain.handle('qa-window-get-status', () => {
      return {
        isOpen: Boolean(qaWindow && !qaWindow.isDestroyed() && qaWindow.isVisible()),
        count: qaHistory.length
      };
    });
  }

  return {
    openQaWindow,
    ensureQaWindowCreated,
    closeQaWindow,
    toggleQaWindow,
    recordQuestion,
    appendChunk,
    finalizeAnswer,
    getHistory,
    clearHistory,
    deleteItem,
    restoreItems,
    registerIpc,
    getQaWindow: () => qaWindow
  };
}

module.exports = {
  createQaManager
};
