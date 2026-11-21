const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qaApi', {
  getQaHistory: () => ipcRenderer.invoke('get-qa-history'),
  clearQaHistory: () => ipcRenderer.invoke('clear-qa-history'),
  deleteQaItem: (id) => ipcRenderer.invoke('delete-qa-item', id),
  restoreQaItems: (items) => ipcRenderer.invoke('restore-qa-items', items),
  closeQaWindow: () => ipcRenderer.invoke('toggle-qa-window', false),
  toggleAlwaysOnTop: (enabled) => ipcRenderer.invoke('qa-window-toggle-pin', enabled),
  moveWindowBy: (deltaX, deltaY) => ipcRenderer.invoke('move-window-by', { deltaX, deltaY }),
  toggleClickThrough: (enabled) => ipcRenderer.invoke('toggle-click-through', enabled),
  getClickThroughStatus: () => ipcRenderer.invoke('get-click-through-status'),
  onClickThroughModeChanged: (callback) => {
    const handler = (_event, enabled) => callback(enabled);
    ipcRenderer.on('set-click-through-mode', handler);
    return () => ipcRenderer.removeListener('set-click-through-mode', handler);
  },
  onQaItemAdded: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('qa-history-item-added', handler);
    return () => ipcRenderer.removeListener('qa-history-item-added', handler);
  },
  onQaAnswerChunk: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('qa-history-answer-chunk', handler);
    return () => ipcRenderer.removeListener('qa-history-answer-chunk', handler);
  },
  onQaAnswerComplete: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('qa-history-answer-complete', handler);
    return () => ipcRenderer.removeListener('qa-history-answer-complete', handler);
  },
  onQaHistoryCleared: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('qa-history-cleared', handler);
    return () => ipcRenderer.removeListener('qa-history-cleared', handler);
  }
});
