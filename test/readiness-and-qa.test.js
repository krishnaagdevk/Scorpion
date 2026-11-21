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

test('stealth window resize calculation enforces minimum bounds and direction vectors', () => {
  function calculateResize(bounds, direction, deltaX, deltaY, minWidth = 360, minHeight = 240) {
    let { x, y, width, height } = bounds;
    const dx = Math.round(Number(deltaX) || 0);
    const dy = Math.round(Number(deltaY) || 0);
    const dir = String(direction || 'se').toLowerCase();

    if (dir.includes('e')) {
      width = Math.max(minWidth, bounds.width + dx);
    }
    if (dir.includes('s')) {
      height = Math.max(minHeight, bounds.height + dy);
    }
    if (dir.includes('w')) {
      const nextWidth = Math.max(minWidth, bounds.width - dx);
      x = bounds.x + (bounds.width - nextWidth);
      width = nextWidth;
    }
    if (dir.includes('n')) {
      const nextHeight = Math.max(minHeight, bounds.height - dy);
      y = bounds.y + (bounds.height - nextHeight);
      height = nextHeight;
    }

    return { x, y, width, height };
  }

  const initial = { x: 100, y: 100, width: 500, height: 400 };

  // Resize southeast (expand width +50, height +60)
  const seRes = calculateResize(initial, 'se', 50, 60);
  assert.equal(seRes.width, 550);
  assert.equal(seRes.height, 460);
  assert.equal(seRes.x, 100);
  assert.equal(seRes.y, 100);

  // Resize northwest (expand leftwards & upwards)
  const nwRes = calculateResize(initial, 'nw', -40, -30);
  assert.equal(nwRes.width, 540);
  assert.equal(nwRes.height, 430);
  assert.equal(nwRes.x, 60);
  assert.equal(nwRes.y, 70);

  // Enforces minimum dimensions
  const clamped = calculateResize(initial, 'se', -400, -300, 360, 240);
  assert.equal(clamped.width, 360);
  assert.equal(clamped.height, 240);
});

test('detectQuestionType accurately categorizes technical, behavioral, and system design questions', () => {
  function detectQuestionType(question = '', answer = '') {
    const combined = (String(question || '') + ' ' + String(answer || '')).toLowerCase();
    if (/```|def\s+[a-z0-9_]+\s*\(|function\s+[a-z0-9_]+\s*\(|class\s+[a-z0-9_]+|\bleetcode\b|\balgorithm\b|\bhashmap\b|\bbinary tree\b|\bdynamic programming\b|\btime complexity\b|\bspace complexity\b|time:\s*o|space:\s*o/i.test(combined)) {
      return { type: 'technical', label: 'Technical / Coding', pillClass: 'tech' };
    }
    if (/tell me about a time|describe a situation|conflict|leadership|failure|challenge|disagreement|teamwork|strength|weakness|tell me about yourself|star method/i.test(combined)) {
      return { type: 'behavioral', label: 'Behavioral (STAR)', pillClass: 'behavioral' };
    }
    if (/system design|scalability|microservice|load balancer|database sharding|\bcache\b|\bcdn\b|\bkafka\b|\barchitecture\b|throughput|latency|high availability/i.test(combined)) {
      return { type: 'system-design', label: 'System Design', pillClass: 'sysdesign' };
    }
    return { type: 'concept', label: 'Core Concept', pillClass: 'concept' };
  }

  const techQ = detectQuestionType('Find two numbers in array that sum to target', 'def twoSum(nums, target):\n    return {}');
  assert.equal(techQ.type, 'technical');
  assert.equal(techQ.pillClass, 'tech');

  const behQ = detectQuestionType('Tell me about a time you handled a difficult conflict with a coworker', 'In my previous role...');
  assert.equal(behQ.type, 'behavioral');
  assert.equal(behQ.pillClass, 'behavioral');

  const sysQ = detectQuestionType('How would you design a high availability URL shortener?', 'We can use Kafka and Redis cache with load balancer.');
  assert.equal(sysQ.type, 'system-design');
  assert.equal(sysQ.pillClass, 'sysdesign');

  const conceptQ = detectQuestionType('Explain how closures work in JavaScript', 'A closure is the combination of a function bundled together with references to its surrounding state.');
  assert.equal(conceptQ.type, 'concept');
  assert.equal(conceptQ.pillClass, 'concept');
});
