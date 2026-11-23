const {
  WINDOW_DEFAULT_WIDTH,
  WINDOW_DEFAULT_HEIGHT,
  WINDOW_MIN_WIDTH,
  WINDOW_MIN_HEIGHT,
  WINDOW_OPACITY_LEVEL_MIN,
  WINDOW_OPACITY_LEVEL_MAX,
  DEFAULT_WINDOW_OPACITY_LEVEL,
  STEALTH_WINDOW_OPACITY
} = require('./window-constants');
const { getKeyboardShortcutAccelerator } = require('../../../config');

function createWindowController({
  app,
  screen,
  globalShortcut,
  createAssistantWindow,
  getAppEnvironment,
  emitSttDebug,
  sendToRenderer,
  onTakeStealthScreenshot,
  onToggleQaWindow,
  getSecondaryWindows
}) {
  let mainWindow = null;
  let isVisible = true;
  let autoHideTimer = null;
  let isRecoveryReloadInProgress = false;
  let lastRecoveryReloadAt = 0;
  let activeWindowOpacityLevel = DEFAULT_WINDOW_OPACITY_LEVEL;
  let clickThroughEnabled = false;
  let pointerMode = 'stealth'; // 'stealth' (default: hidden from share, visible to user) | 'hidden' (hidden from both) | 'system' (standard)
  let isPanicActive = false;
  let screenShareShieldActive = false;
  let savedOpacityBeforeShield = DEFAULT_WINDOW_OPACITY_LEVEL;

  const RECOVERY_RELOAD_COOLDOWN_MS = 5000;

  function getCompanionWindows() {
    if (typeof getSecondaryWindows === 'function') {
      const list = getSecondaryWindows();
      if (Array.isArray(list)) {
        return list.filter((win) => win && !win.isDestroyed());
      }
    }
    return [];
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function clampWindowOpacityLevel(level) {
    const parsedLevel = Number.parseInt(String(level ?? ''), 10);

    if (!Number.isFinite(parsedLevel)) {
      return DEFAULT_WINDOW_OPACITY_LEVEL;
    }

    return clamp(parsedLevel, WINDOW_OPACITY_LEVEL_MIN, WINDOW_OPACITY_LEVEL_MAX);
  }

  function setWindowOpacityLevel(level) {
    activeWindowOpacityLevel = clampWindowOpacityLevel(level);
    applyWindowOpacity();
    return activeWindowOpacityLevel;
  }

  function getWindowOpacityLevel() {
    return activeWindowOpacityLevel;
  }

  function getWindowOpacityFromLevel(level) {
    return clampWindowOpacityLevel(level) / 10;
  }

  function getVisibleWindowOpacity() {
    return getWindowOpacityFromLevel(activeWindowOpacityLevel);
  }

  function getStealthWindowOpacity() {
    return Math.min(getVisibleWindowOpacity(), STEALTH_WINDOW_OPACITY);
  }

  function getCurrentWindowOpacity() {
    if (isPanicActive) {
      return 0.01;
    }
    return isVisible ? getVisibleWindowOpacity() : getStealthWindowOpacity();
  }

  function applyWindowOpacity() {
    const opacity = getCurrentWindowOpacity();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(opacity);
    }

    const companionWindows = getCompanionWindows();
    for (const win of companionWindows) {
      try {
        win.setOpacity(opacity);
      } catch (err) {
        // window may have been closed
      }
    }
  }

  function recoverMainWindowVisibility(reason, { reload = false } = {}) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    console.warn(`Window recovery triggered: ${reason}`);
    if (typeof emitSttDebug === 'function') {
      emitSttDebug({
        level: 'error',
        event: 'window-recovery',
        message: reason
      });
    }

    try {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
        autoHideTimer = null;
      }

      isVisible = true;
      mainWindow.setOpacity(getVisibleWindowOpacity());
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      sendToRenderer('set-stealth-mode', false);
    } catch (error) {
      console.error('Window visibility recovery failed:', error);
    }

    if (!reload || !mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
      return;
    }

    const now = Date.now();
    if (isRecoveryReloadInProgress || now - lastRecoveryReloadAt < RECOVERY_RELOAD_COOLDOWN_MS) {
      return;
    }

    isRecoveryReloadInProgress = true;
    lastRecoveryReloadAt = now;
    try {
      mainWindow.webContents.reload();
      if (typeof emitSttDebug === 'function') {
        emitSttDebug({
          event: 'window-reload',
          message: 'Triggered guarded renderer reload'
        });
      }
    } catch (error) {
      console.error('Window recovery reload failed:', error);
      isRecoveryReloadInProgress = false;
      return;
    }

    setTimeout(() => {
      isRecoveryReloadInProgress = false;
    }, 1500);
  }

  function attachWindowRecoveryHandlers() {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.on('unresponsive', () => {
      console.error('Main window became unresponsive');
      recoverMainWindowVisibility('window-unresponsive', { reload: true });
    });

    const contents = mainWindow.webContents;
    if (!contents || contents.isDestroyed()) {
      return;
    }

    contents.on('render-process-gone', (_event, details) => {
      console.error('Renderer process gone:', details);
      recoverMainWindowVisibility('render-process-gone', { reload: true });
    });

    contents.on('unresponsive', () => {
      console.error('WebContents became unresponsive');
      recoverMainWindowVisibility('webcontents-unresponsive', { reload: true });
    });

    contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error('WebContents did-fail-load:', {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame
      });
      recoverMainWindowVisibility('did-fail-load', { reload: !!isMainFrame });
    });

    contents.on('did-finish-load', () => {
      isRecoveryReloadInProgress = false;
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('set-pointer-visibility', {
            mode: pointerMode,
            isStealth: pointerMode === 'stealth',
            isHidden: pointerMode === 'hidden',
            isSystem: pointerMode === 'system'
          });
        }
      } catch (err) {}
    });
  }

  function createWindow({ launchHidden = false } = {}) {
    const appEnvironment = getAppEnvironment();
    mainWindow = createAssistantWindow({
      app,
      screen,
      defaultWidth: WINDOW_DEFAULT_WIDTH,
      defaultHeight: WINDOW_DEFAULT_HEIGHT,
      minWidth: WINDOW_MIN_WIDTH,
      minHeight: WINDOW_MIN_HEIGHT,
      hideFromScreenCapture: appEnvironment.hideFromScreenCapture,
      initialOpacity: launchHidden ? getStealthWindowOpacity() : getVisibleWindowOpacity(),
      launchHidden,
      nodeEnv: appEnvironment.nodeEnv
    });

    attachWindowRecoveryHandlers();
    isVisible = !launchHidden;
    return mainWindow;
  }

  function getMainWindow() {
    return mainWindow;
  }

  function getSafeWindowBounds(nextBounds = {}) {
    const currentBounds = mainWindow ? mainWindow.getBounds() : {
      x: 0,
      y: 0,
      width: WINDOW_DEFAULT_WIDTH,
      height: WINDOW_DEFAULT_HEIGHT
    };

    const rawBounds = {
      x: Number.isFinite(nextBounds.x) ? Math.round(nextBounds.x) : currentBounds.x,
      y: Number.isFinite(nextBounds.y) ? Math.round(nextBounds.y) : currentBounds.y,
      width: Number.isFinite(nextBounds.width) ? Math.round(nextBounds.width) : currentBounds.width,
      height: Number.isFinite(nextBounds.height) ? Math.round(nextBounds.height) : currentBounds.height
    };

    const display = screen.getDisplayMatching(rawBounds);
    const workArea = display && display.workArea ? display.workArea : screen.getPrimaryDisplay().workArea;

    const width = clamp(rawBounds.width, WINDOW_MIN_WIDTH, workArea.width);
    const height = clamp(rawBounds.height, WINDOW_MIN_HEIGHT, workArea.height);
    const x = clamp(rawBounds.x, workArea.x, workArea.x + workArea.width - width);
    const y = clamp(rawBounds.y, workArea.y, workArea.y + workArea.height - height);

    return { x, y, width, height };
  }

  function setWindowBounds(nextBounds) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { error: 'Main window not available' };
    }

    const safeBounds = getSafeWindowBounds(nextBounds);
    mainWindow.setBounds(safeBounds, false);
    return mainWindow.getBounds();
  }

  function getWindowBounds() {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { error: 'Main window not available' };
    }

    return mainWindow.getBounds();
  }

  function toggleStealthMode() {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    const stealthModeEnabled = isVisible;
    isVisible = !stealthModeEnabled;
    if (isVisible && !mainWindow.isVisible()) {
      mainWindow.showInactive();
    }
    const companionWindows = getCompanionWindows();
    for (const win of companionWindows) {
      if (isVisible && !win.isVisible()) {
        try {
          win.showInactive();
        } catch (err) {}
      }
    }
    applyWindowOpacity();
    sendToRenderer('set-stealth-mode', stealthModeEnabled);
  }

  function emergencyHide(options = {}) {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: 'Main window not available' };
    }

    // Toggle panic mode if already panicked and not forced
    if (isPanicActive && options.force !== true) {
      isPanicActive = false;
      isVisible = true;
      applyWindowOpacity();
      sendToRenderer('set-stealth-mode', false);
      sendToRenderer('set-panic-mode', false);
      return { success: true, isPanicActive: false };
    }

    isPanicActive = true;
    mainWindow.setOpacity(0.01);
    const companionWindows = getCompanionWindows();
    for (const win of companionWindows) {
      try {
        win.setOpacity(0.01);
      } catch (err) {}
    }
    sendToRenderer('emergency-clear');
    sendToRenderer('set-panic-mode', true);

    if (options.autoRestore === true) {
      autoHideTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          isPanicActive = false;
          isVisible = true;
          applyWindowOpacity();
          sendToRenderer('set-stealth-mode', false);
          sendToRenderer('set-panic-mode', false);
        }
        autoHideTimer = null;
      }, 2000);
    }

    return { success: true, isPanicActive: true };
  }

  function isPanicModeActive() {
    return isPanicActive;
  }

  function toggleScreenShareShield(enable) {
    const shouldEnable = typeof enable === 'boolean' ? enable : !screenShareShieldActive;
    screenShareShieldActive = shouldEnable;
    if (screenShareShieldActive) {
      savedOpacityBeforeShield = activeWindowOpacityLevel;
      setWindowOpacityLevel(2); // Level 2 = 0.20 opacity (ultra stealth)
      setClickThrough(true);
    } else {
      setWindowOpacityLevel(savedOpacityBeforeShield || DEFAULT_WINDOW_OPACITY_LEVEL);
      setClickThrough(false);
    }
    sendToRenderer('set-screen-share-shield', screenShareShieldActive);
    return { success: true, screenShareShieldActive };
  }

  function isScreenShareShieldActive() {
    return screenShareShieldActive;
  }

  function moveToPosition(position) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const windowBounds = mainWindow.getBounds();

    let x;
    let y;

    switch (position) {
      case 'left':
        x = 20;
        y = windowBounds.y;
        break;
      case 'right':
        x = width - windowBounds.width - 20;
        y = windowBounds.y;
        break;
      case 'top':
        x = Math.floor((width - windowBounds.width) / 2);
        y = 40;
        break;
      case 'bottom':
        x = Math.floor((width - windowBounds.width) / 2);
        y = height - windowBounds.height - 40;
        break;
      default:
        return;
    }

    mainWindow.setPosition(x, y);
  }

  function clampWindowSizePreset(preset) {
    const parsedPreset = Number.parseInt(String(preset ?? ''), 10);
    if (!Number.isFinite(parsedPreset)) {
      return 1;
    }

    return clamp(parsedPreset, 1, 4);
  }

  function getWindowSizeScaleForPreset(preset) {
    const clampedPreset = clampWindowSizePreset(preset);
    return 1 + ((clampedPreset - 1) * 0.25);
  }

  function setWindowSizePreset(preset) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { error: 'Main window not available' };
    }

    const clampedPreset = clampWindowSizePreset(preset);
    const scale = getWindowSizeScaleForPreset(clampedPreset);
    const currentBounds = mainWindow.getBounds();

    const width = Math.round(WINDOW_MIN_WIDTH * scale);
    const height = Math.round(WINDOW_MIN_HEIGHT * scale);

    const centerX = currentBounds.x + Math.round(currentBounds.width / 2);
    const centerY = currentBounds.y + Math.round(currentBounds.height / 2);

    const nextBounds = getSafeWindowBounds({
      x: centerX - Math.round(width / 2),
      y: centerY - Math.round(height / 2),
      width,
      height
    });

    mainWindow.setBounds(nextBounds, false);
    return {
      ...mainWindow.getBounds(),
      preset: clampedPreset
    };
  }

  function setClickThrough(enabled) {
    clickThroughEnabled = Boolean(enabled);
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        if (typeof mainWindow.setIgnoreMouseEvents === 'function') {
          mainWindow.setIgnoreMouseEvents(clickThroughEnabled, { forward: true });
        }
      } catch (err) {
        console.error('Failed to set ignore mouse events on mainWindow:', err);
      }
    }

    const companionWindows = getCompanionWindows();
    for (const win of companionWindows) {
      try {
        if (typeof win.setIgnoreMouseEvents === 'function') {
          win.setIgnoreMouseEvents(clickThroughEnabled, { forward: true });
        }
      } catch (err) {
        // window may have been closed
      }
    }

    sendToRenderer('set-click-through-mode', clickThroughEnabled);
    for (const win of companionWindows) {
      try {
        if (win.webContents && !win.webContents.isDestroyed()) {
          win.webContents.send('set-click-through-mode', clickThroughEnabled);
        }
      } catch (err) {}
    }

    return { success: true, clickThroughEnabled };
  }

  function toggleClickThrough() {
    return setClickThrough(!clickThroughEnabled);
  }

  function isClickThroughEnabled() {
    return clickThroughEnabled;
  }

  function getPointerMode() {
    return pointerMode;
  }

  function setPointerMode(mode) {
    const validModes = ['stealth', 'hidden', 'system'];
    if (validModes.includes(mode)) {
      pointerMode = mode;
    } else {
      pointerMode = 'stealth';
    }

    const payload = {
      mode: pointerMode,
      isStealth: pointerMode === 'stealth',
      isHidden: pointerMode === 'hidden',
      isSystem: pointerMode === 'system'
    };

    sendToRenderer('set-pointer-visibility', payload);

    const companionWindows = getCompanionWindows();
    for (const win of companionWindows) {
      try {
        if (win.webContents && !win.webContents.isDestroyed()) {
          win.webContents.send('set-pointer-visibility', payload);
        }
      } catch (err) {}
    }

    return { success: true, mode: pointerMode };
  }

  function togglePointerVisibility() {
    // Toggles between stealth (visible to user, hidden on share) and hidden (zero distraction)
    const nextMode = pointerMode === 'stealth' ? 'hidden' : 'stealth';
    return setPointerMode(nextMode);
  }

  function dockToTop() {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { error: 'Main window not available' };
    }
    const { width } = screen.getPrimaryDisplay().workAreaSize;
    const windowBounds = mainWindow.getBounds();
    const x = Math.floor((width - windowBounds.width) / 2);
    const y = 16;
    mainWindow.setPosition(x, y);
    return { success: true, x, y };
  }

  function registerShortcuts() {
    const registerShortcut = (shortcutId, handler) => {
      const accelerator = getKeyboardShortcutAccelerator(shortcutId);
      const isRegistered = globalShortcut.register(accelerator, handler);
      if (!isRegistered) {
        console.warn(`Failed to register shortcut "${shortcutId}" (${accelerator})`);
      }
    };

    registerShortcut('toggleStealth', () => {
      toggleStealthMode();
    });

    registerShortcut('takeScreenshot', async () => {
      if (typeof onTakeStealthScreenshot === 'function') {
        await onTakeStealthScreenshot();
      }
    });

    registerShortcut('askAi', async () => {
      if (typeof emitSttDebug === 'function') {
        emitSttDebug({
          event: 'shortcut-ask-ai',
          message: 'Global Ask AI shortcut triggered'
        });
      }
      sendToRenderer('trigger-ask-ai');
    });

    registerShortcut('emergencyHide', () => {
      emergencyHide();
    });

    registerShortcut('toggleTranscription', () => {
      if (typeof emitSttDebug === 'function') {
        emitSttDebug({
          event: 'shortcut-toggle',
          message: 'Global transcription shortcut triggered'
        });
      }
      sendToRenderer('toggle-voice-recognition');
    });

    registerShortcut('toggleQaWindow', () => {
      if (typeof onToggleQaWindow === 'function') {
        onToggleQaWindow();
      }
    });

    registerShortcut('moveWindowLeft', () => {
      moveToPosition('left');
    });

    registerShortcut('moveWindowRight', () => {
      moveToPosition('right');
    });

    registerShortcut('moveWindowUp', () => {
      moveToPosition('top');
    });

    registerShortcut('moveWindowDown', () => {
      moveToPosition('bottom');
    });

    registerShortcut('windowSizePreset1', () => {
      setWindowSizePreset(1);
    });

    registerShortcut('windowSizePreset2', () => {
      setWindowSizePreset(2);
    });

    registerShortcut('windowSizePreset3', () => {
      setWindowSizePreset(3);
    });

    registerShortcut('windowSizePreset4', () => {
      setWindowSizePreset(4);
    });

    registerShortcut('toggleClickThrough', () => {
      toggleClickThrough();
    });

    // Also register alternative aliases (Control+Alt+P / CommandOrControl+Alt+P) for ghost mode
    const ghostAliases = ['Control+Alt+P', 'CommandOrControl+Alt+P'];
    for (const alias of ghostAliases) {
      try {
        globalShortcut.register(alias, () => {
          toggleClickThrough();
        });
      } catch (err) {}
    }

    registerShortcut('togglePointerVisibility', () => {
      togglePointerVisibility();
    });

    // Also register alternative aliases for stealth pointer toggle
    const pointerAliases = ['Control+Alt+M', 'CommandOrControl+Alt+M'];
    for (const alias of pointerAliases) {
      try {
        globalShortcut.register(alias, () => {
          togglePointerVisibility();
        });
      } catch (err) {}
    }

    registerShortcut('dockToTop', () => {
      dockToTop();
    });
  }

  function unregisterShortcuts() {
    globalShortcut.unregisterAll();
  }

  function destroyWindow() {
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.setClosable(true);
    mainWindow.destroy();
    mainWindow = null;
  }

  function hasWindow() {
    return !!mainWindow && !mainWindow.isDestroyed();
  }

  function markVisible() {
    isVisible = true;
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.showInactive();
    }
    applyWindowOpacity();
  }

  return {
    applyWindowOpacity,
    clampWindowOpacityLevel,
    createWindow,
    destroyWindow,
    dockToTop,
    emergencyHide,
    getCurrentWindowOpacity,
    getMainWindow,
    getWindowBounds,
    getWindowOpacityLevel,
    hasWindow,
    isClickThroughEnabled,
    isPanicModeActive,
    isScreenShareShieldActive,
    getPointerMode,
    markVisible,
    registerShortcuts,
    setClickThrough,
    setPointerMode,
    setWindowSizePreset,
    setWindowBounds,
    setWindowOpacityLevel,
    toggleClickThrough,
    togglePanicMode: emergencyHide,
    togglePointerVisibility,
    toggleScreenShareShield,
    toggleStealthMode,
    unregisterShortcuts
  };
}

module.exports = {
  createWindowController
};
