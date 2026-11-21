const test = require('node:test');
const assert = require('node:assert/strict');
const { runAllReadinessChecks } = require('../src/services/system/system-readiness');
const { createQaManager } = require('../src/main-process/features/qa-history/qa-manager');

test('runAllReadinessChecks returns complete diagnostic check suite', async () => {
  const mockAppState = {
    assemblyAiApiKey: 'test-key',
    aiProvider: 'antigravity',
    antigravityModel: 'gemini-3.8-flash-low'
  };

  const result = await runAllReadinessChecks(null, mockAppState);
  assert.equal(result.success, true);
  assert.ok(Array.isArray(result.checks), 'checks should be an array');
  assert.equal(result.checks.length, 5, 'should have 5 core readiness checks');

  const checkIds = result.checks.map(c => c.id);
  assert.ok(checkIds.includes('antigravity'), 'must check antigravity');
  assert.ok(checkIds.includes('screenProtection'), 'must check screenProtection');
  assert.ok(checkIds.includes('audio'), 'must check audio');
  assert.ok(checkIds.includes('stt'), 'must check stt');
  assert.ok(checkIds.includes('workspace'), 'must check workspace');
});

test('createQaManager records questions, streams chunks, and completes answers', () => {
  const qaManager = createQaManager({
    app: null,
    screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
    getAppEnvironment: () => ({ hideFromScreenCapture: true })
  });

  const id = qaManager.recordQuestion({
    question: 'How do you design a distributed cache?',
    source: 'voice'
  });

  assert.ok(typeof id === 'string' && id.length > 0);
  qaManager.appendChunk(id, 'You can use Redis with consistent hashing.');
  qaManager.finalizeAnswer(id, '**🎯 Question:** Design a Distributed Rate Limiter\n\nYou can use Redis with consistent hashing.\n```python\nimport redis\n```');

  const history = qaManager.getHistory();
  assert.equal(history.length >= 1, true);
  const item = history.find(i => i.id === id);
  assert.ok(item);
  assert.equal(item.status, 'completed');
  assert.equal(item.hasCode, true);
  assert.equal(item.identifiedQuestion, 'Design a Distributed Rate Limiter');
  assert.ok(item.answer.includes('consistent hashing'));

  // Test clear
  qaManager.clearHistory();
  const cleared = qaManager.getHistory();
  assert.equal(cleared.length, 0);

  // Test deleteItem and restoreItems (recall)
  const id2 = qaManager.recordQuestion({ question: 'Test Q2', source: 'voice' });
  qaManager.finalizeAnswer(id2, 'Answer 2');
  assert.equal(qaManager.getHistory().length, 1);
  qaManager.deleteItem(id2);
  assert.equal(qaManager.getHistory().length, 0);
  const restoreRes = qaManager.restoreItems([{ id: id2, question: 'Test Q2', answer: 'Answer 2' }]);
  assert.equal(restoreRes.success, true);
  assert.equal(qaManager.getHistory().length, 1);
});

test('windowController synchronizes opacity and emergency hide to companion windows', () => {
  const { createWindowController } = require('../src/main-process/features/window/window-controller');
  
  let mainWindowOpacity = 1;
  let companionOpacity = 1;
  let mainWindowIgnoreMouse = false;
  let companionIgnoreMouse = false;
  let mainWindowPos = { x: 0, y: 0 };
  const mockMainWindow = {
    isDestroyed: () => false,
    isVisible: () => true,
    setOpacity: (val) => { mainWindowOpacity = val; },
    getBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    showInactive: () => {},
    on: () => {},
    webContents: { on: () => {}, isDestroyed: () => false, send: () => {} },
    setIgnoreMouseEvents: (ignore) => { mainWindowIgnoreMouse = ignore; },
    setPosition: (x, y) => { mainWindowPos = { x, y }; }
  };
  const mockCompanionWindow = {
    isDestroyed: () => false,
    isVisible: () => true,
    setOpacity: (val) => { companionOpacity = val; },
    showInactive: () => {},
    webContents: { on: () => {}, isDestroyed: () => false, send: () => {} },
    setIgnoreMouseEvents: (ignore) => { companionIgnoreMouse = ignore; }
  };

  const controller = createWindowController({
    app: { dock: { hide: () => {} } },
    screen: {
      getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 }, workAreaSize: { width: 1920, height: 1080 } }),
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
    },
    globalShortcut: { register: () => true, unregisterAll: () => {} },
    createAssistantWindow: () => mockMainWindow,
    getAppEnvironment: () => ({ hideFromScreenCapture: true }),
    sendToRenderer: () => {},
    getSecondaryWindows: () => [mockCompanionWindow]
  });

  controller.createWindow();

  // Test setWindowOpacityLevel
  controller.setWindowOpacityLevel(5); // 0.5 opacity
  assert.equal(mainWindowOpacity, 0.5);
  assert.equal(companionOpacity, 0.5);

  // Test emergencyHide
  controller.emergencyHide();
  assert.equal(mainWindowOpacity, 0.01);
  assert.equal(companionOpacity, 0.01);

  // Test Click-Through (Ghost Mode)
  assert.equal(controller.isClickThroughEnabled(), false);
  controller.setClickThrough(true);
  assert.equal(controller.isClickThroughEnabled(), true);
  assert.equal(mainWindowIgnoreMouse, true);
  assert.equal(companionIgnoreMouse, true);

  controller.toggleClickThrough();
  assert.equal(controller.isClickThroughEnabled(), false);
  assert.equal(mainWindowIgnoreMouse, false);
  assert.equal(companionIgnoreMouse, false);

  // Test Dock to Top
  const dockRes = controller.dockToTop();
  assert.equal(dockRes.success, true);
  assert.equal(dockRes.y, 16);
  assert.equal(dockRes.x, Math.floor((1920 - 800) / 2));
  assert.equal(mainWindowPos.y, 16);
});
