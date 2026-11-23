'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getKeyboardShortcutAccelerator, getKeyboardShortcuts, getKeyboardShortcutById } = require('../src/config');
const { createWindowController } = require('../src/main-process/features/window/window-controller');
const { initStealthCursor } = require('../src/windows/common/stealth-cursor');

test('regenerator-runtime is resolvable and loads cleanly', () => {
  assert.doesNotThrow(() => {
    require('regenerator-runtime/runtime');
  });
});

test('keyboard shortcuts include togglePointerVisibility with Alt+Shift+M', () => {
  const shortcuts = getKeyboardShortcuts();
  const shortcut = shortcuts.find((s) => s.id === 'togglePointerVisibility');
  assert.ok(shortcut, 'togglePointerVisibility shortcut should be defined');
  assert.equal(shortcut.accelerator, 'Alt+Shift+M');
  assert.equal(getKeyboardShortcutAccelerator('togglePointerVisibility'), 'Alt+Shift+M');
  assert.equal(getKeyboardShortcutById('togglePointerVisibility').accelerator, 'Alt+Shift+M');
});

test('createWindowController initializes with stealth pointer mode by default', () => {
  const sentEvents = [];
  const registeredShortcuts = {};

  const controller = createWindowController({
    app: { dock: { hide() {} } },
    screen: {
      getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } })
    },
    globalShortcut: {
      register: (accelerator, handler) => {
        registeredShortcuts[accelerator] = handler;
        return true;
      },
      unregisterAll: () => {}
    },
    createAssistantWindow: () => ({
      isDestroyed: () => false,
      webContents: {
        on: () => {},
        send: (channel, data) => sentEvents.push({ channel, data })
      },
      setOpacity: () => {},
      setPosition: () => {},
      getBounds: () => ({ x: 0, y: 0, width: 600, height: 400 }),
      setBounds: () => {}
    }),
    getAppEnvironment: () => ({ hideFromScreenCapture: true, nodeEnv: 'test' }),
    sendToRenderer: (channel, data) => sentEvents.push({ channel, data })
  });

  // Default mode should be 'stealth'
  assert.equal(controller.getPointerMode(), 'stealth');

  // Toggle should switch to 'hidden'
  const toggleRes1 = controller.togglePointerVisibility();
  assert.equal(toggleRes1.mode, 'hidden');
  assert.equal(controller.getPointerMode(), 'hidden');

  // Toggle again should switch back to 'stealth'
  const toggleRes2 = controller.togglePointerVisibility();
  assert.equal(toggleRes2.mode, 'stealth');
  assert.equal(controller.getPointerMode(), 'stealth');

  // Explicit setPointerMode
  controller.setPointerMode('system');
  assert.equal(controller.getPointerMode(), 'system');

  // Invalid mode should fallback to stealth
  controller.setPointerMode('unknown-invalid');
  assert.equal(controller.getPointerMode(), 'stealth');

  // Verify IPC events were sent to renderer
  const pointerEvents = sentEvents.filter((e) => e.channel === 'set-pointer-visibility');
  assert.ok(pointerEvents.length >= 3);
  const lastEvent = pointerEvents[pointerEvents.length - 1];
  assert.equal(lastEvent.data.mode, 'stealth');
  assert.equal(lastEvent.data.isStealth, true);
  assert.equal(lastEvent.data.isHidden, false);

  // Verify shortcut registration
  controller.registerShortcuts();
  assert.ok(typeof registeredShortcuts['Alt+Shift+M'] === 'function');
  assert.ok(typeof registeredShortcuts['Control+Alt+M'] === 'function');
});

test('StealthCursor client module handles mock DOM and mode transitions', async () => {
  // Simple DOM mock
  const classList = new Set();
  const mockDocEl = {
    classList: {
      add: (c) => classList.add(c),
      remove: (c) => classList.delete(c),
      contains: (c) => classList.has(c)
    }
  };

  const cursorClassList = new Set();
  const mockCursorEl = {
    id: 'stealth-virtual-cursor',
    classList: {
      add: (c) => cursorClassList.add(c),
      remove: (c) => cursorClassList.delete(c),
      contains: (c) => cursorClassList.has(c)
    },
    style: {},
    setAttribute: () => {},
    parentNode: { removeChild: () => {} }
  };

  const originalDoc = global.document;
  const originalWin = global.window;

  global.document = {
    documentElement: mockDocEl,
    getElementById: (id) => (id === 'stealth-virtual-cursor' ? mockCursorEl : null),
    createElement: () => mockCursorEl,
    body: { appendChild: () => {} }
  };

  const eventListeners = {};
  global.window = {
    addEventListener: (type, fn) => {
      eventListeners[type] = fn;
    },
    removeEventListener: (type) => {
      delete eventListeners[type];
    },
    requestAnimationFrame: (cb) => cb()
  };

  try {
    let modeChanges = [];
    const client = initStealthCursor({
      onModeChange: (m) => modeChanges.push(m)
    });

    assert.equal(client.getMode(), 'stealth');
    assert.ok(mockDocEl.classList.contains('stealth-cursor-mode'));
    assert.ok(!mockCursorEl.classList.contains('cursor-hidden'));

    client.setMode('hidden');
    assert.equal(client.getMode(), 'hidden');
    assert.ok(mockDocEl.classList.contains('stealth-cursor-mode'));
    assert.ok(mockCursorEl.classList.contains('cursor-hidden'));

    client.setMode('system');
    assert.equal(client.getMode(), 'system');
    assert.ok(!mockDocEl.classList.contains('stealth-cursor-mode'));

    client.destroy();
  } finally {
    global.document = originalDoc;
    global.window = originalWin;
  }
});
