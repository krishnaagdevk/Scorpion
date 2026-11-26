const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

process.env.NODE_ENV = 'test';

const AntigravityService = require('../src/services/ai/antigravity-service');
const { parseAntigravityModelsOutput } = AntigravityService;
const OpenCodeService = require('../src/services/ai/opencode-service');
const {
  parseOpenCodeModelsOutput,
  extractTextFromOpenCodeJsonEvent
} = OpenCodeService;
const {
  getNpmPackageForPlatform,
  extractBinaryFromTarGz,
  getOpenCodeBinaryName
} = require('../src/services/ai/opencode-installer');
const CliAgentService = require('../src/services/ai/cli-agent-service');
const { createGeminiRuntime } = require('../src/main-process/features/assistant/gemini-runtime');
const {
  buildAskAiSessionPrompt,
  buildSuggestResponsePrompt
} = require('../src/services/ai/prompts');
const {
  resolveAiProvider,
  getAiProviders,
  setDiscoveredAntigravityModels,
  getAntigravityModels,
  getDefaultAntigravityModel,
  resolveAntigravityModel,
  setDiscoveredOpenCodeModels,
  getOpenCodeModels,
  getFreeOpenCodeModels,
  getDefaultOpenCodeModel,
  resolveOpenCodeModel
} = require('../src/config');
const { sanitizeAppState } = require('../src/services/state/app-state');

test('AI Providers config includes antigravity, opencode, codex, claude-code and supports dynamic Antigravity models', () => {
  const providers = getAiProviders();
  assert.ok(providers.includes('antigravity'), 'antigravity must be in AI_PROVIDERS');
  assert.ok(providers.includes('opencode'), 'opencode must be in AI_PROVIDERS');
  assert.ok(providers.includes('codex'), 'codex must be in AI_PROVIDERS');
  assert.ok(providers.includes('claude-code'), 'claude-code must be in AI_PROVIDERS');
  assert.equal(resolveAiProvider('antigravity'), 'antigravity');
  assert.equal(resolveAiProvider('opencode'), 'opencode');
  assert.equal(resolveAiProvider('codex'), 'codex');
  assert.equal(resolveAiProvider('claude-code'), 'claude-code');

  const parsedAg = parseAntigravityModelsOutput([
    'Fetching available models...',
    'gemini-4-hydrogen-medium\tGemini 4 Hydrogen (Medium)',
    'claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)'
  ].join('\n'));
  assert.equal(parsedAg.length, 2);
  assert.equal(parsedAg[0].id, 'gemini-4-hydrogen-medium');
  assert.equal(parsedAg[0].name, 'Gemini 4 Hydrogen (Medium)');

  setDiscoveredAntigravityModels(parsedAg);
  const models = getAntigravityModels();
  assert.deepEqual(models, ['gemini-4-hydrogen-medium', 'claude-sonnet-4-6']);
  assert.equal(getDefaultAntigravityModel(), 'gemini-4-hydrogen-medium');
  assert.equal(resolveAntigravityModel('claude-sonnet-4-6'), 'claude-sonnet-4-6');
  assert.equal(resolveAntigravityModel('deprecated-model'), 'gemini-4-hydrogen-medium');
});

test('OpenCode model parser auto-detects free models and prioritizes them', () => {
  const sampleOutput = [
    'anthropic/claude-sonnet-4-6',
    '{',
    '  "id": "claude-sonnet-4-6",',
    '  "providerID": "anthropic",',
    '  "name": "Claude Sonnet 4.6",',
    '  "status": "active",',
    '  "cost": { "input": 3, "output": 15 }',
    '}',
    'opencode/beam-free',
    '{',
    '  "id": "beam-free",',
    '  "providerID": "opencode",',
    '  "name": "Beam Free",',
    '  "status": "active",',
    '  "cost": { "input": 0, "output": 0 }',
    '}',
    'openrouter/z-ai/glm-5.2:free'
  ].join('\n');

  const parsed = parseOpenCodeModelsOutput(sampleOutput);
  assert.equal(parsed.length, 3);
  setDiscoveredOpenCodeModels(parsed);

  const freeModels = getFreeOpenCodeModels();
  assert.ok(freeModels.includes('opencode/beam-free'));
  assert.ok(freeModels.includes('openrouter/z-ai/glm-5.2:free'));
  assert.ok(!freeModels.includes('anthropic/claude-sonnet-4-6'));
  assert.equal(getDefaultOpenCodeModel(), 'opencode/beam-free');
  assert.ok(getOpenCodeModels()[0] === 'opencode/beam-free');
  assert.equal(resolveOpenCodeModel('anthropic/claude-sonnet-4-6'), 'anthropic/claude-sonnet-4-6');
});

test('OpenCode JSON event extractor and tar.gz binary extractor work', () => {
  assert.equal(extractTextFromOpenCodeJsonEvent({ type: 'text', part: { text: 'Hello' } }), 'Hello');
  assert.equal(extractTextFromOpenCodeJsonEvent({ properties: { delta: ' world' } }), ' world');
  assert.ok(getNpmPackageForPlatform(), 'Current platform should map to an opencode npm package');

  // Build minimal valid 512-byte USTAR tar containing package/bin/<binName>
  const binName = getOpenCodeBinaryName();
  const payload = Buffer.from('mock-opencode-binary');
  const header = Buffer.alloc(512, 0);
  Buffer.from(`package/bin/${binName}`).copy(header, 0);
  Buffer.from('0000755\0').copy(header, 100);
  Buffer.from(`${payload.length.toString(8).padStart(11, '0')}\0`).copy(header, 124);
  header[156] = 48; // '0' regular file
  const paddedPayload = Buffer.alloc(512, 0);
  payload.copy(paddedPayload, 0);
  const tarBuf = Buffer.concat([header, paddedPayload, Buffer.alloc(1024, 0)]);
  const tgzBuf = zlib.gzipSync(tarBuf);

  const tmpTarget = path.join(os.tmpdir(), `scorpion-test-${Date.now()}`, binName);
  extractBinaryFromTarGz(tgzBuf, tmpTarget);
  assert.equal(fs.readFileSync(tmpTarget, 'utf8'), 'mock-opencode-binary');
  fs.rmSync(path.dirname(tmpTarget), { recursive: true, force: true });
});

test('sanitizeAppState accepts new AI providers including opencode without resetting', () => {
  const stateAntigravity = sanitizeAppState({ aiProvider: 'antigravity', antigravityModel: 'claude-sonnet-4-6' });
  assert.equal(stateAntigravity.aiProvider, 'antigravity');
  assert.equal(stateAntigravity.antigravityModel, 'claude-sonnet-4-6');

  const stateOpenCode = sanitizeAppState({ aiProvider: 'opencode', opencodeModel: 'opencode/beam-free' });
  assert.equal(stateOpenCode.aiProvider, 'opencode');
  assert.equal(stateOpenCode.opencodeModel, 'opencode/beam-free');

  const stateCodex = sanitizeAppState({ aiProvider: 'codex', cliAgentType: 'codex' });
  assert.equal(stateCodex.aiProvider, 'codex');
  assert.equal(stateCodex.cliAgentType, 'codex');

  const stateClaude = sanitizeAppState({ aiProvider: 'claude-code', cliAgentType: 'claude-code' });
  assert.equal(stateClaude.aiProvider, 'claude-code');
});

test('AntigravityService initializes and manages conversation history', () => {
  const service = new AntigravityService({ programmingLanguage: 'JavaScript', modelName: 'claude-sonnet-4-6' });
  assert.equal(service.modelName, 'claude-sonnet-4-6');
  assert.equal(service.programmingLanguage, 'JavaScript');

  service.addToHistory('user', 'What is recursion?');
  service.addToHistory('assistant', 'Recursion is a function calling itself.');

  const context = service.getContextString();
  assert.ok(context.includes('recursion'), 'Context string should include added history');

  service.clearHistory();
  assert.equal(service.getContextString(), '');
});

test('CliAgentService initializes codex, claude-code, and custom modes', () => {
  const codexService = new CliAgentService({ agentType: 'codex' });
  assert.equal(codexService.agentType, 'codex');
  assert.equal(codexService.cliCmd, 'codex');

  const claudeService = new CliAgentService({ agentType: 'claude-code' });
  assert.equal(claudeService.agentType, 'claude-code');
  assert.equal(claudeService.cliCmd, 'claude');

  const customService = new CliAgentService({ agentType: 'custom', customCmd: 'my-agent' });
  assert.equal(customService.agentType, 'custom');
  assert.equal(customService.cliCmd, 'my-agent');
});

test('GeminiRuntime routes providers and executes without requiring API keys for Antigravity and OpenCode', () => {
  const runtime = createGeminiRuntime();
  runtime.setActiveAiProvider('antigravity');
  assert.equal(runtime.getActiveAiProvider(), 'antigravity');

  const service = runtime.initializeAiService();
  assert.ok(service instanceof AntigravityService);
  assert.equal(runtime.getService(), service);

  runtime.setActiveAiProvider('opencode');
  assert.equal(runtime.getActiveAiProvider(), 'opencode');
  const ocService = runtime.initializeAiService();
  assert.ok(ocService instanceof OpenCodeService);
  assert.equal(runtime.getService(), ocService);
});

test('GeminiRuntime automatically routes across models within a provider and fails over to OpenCode/configured providers', async () => {
  setDiscoveredAntigravityModels([
    { id: 'ag-model-1', name: 'AG Model 1' },
    { id: 'ag-model-2', name: 'AG Model 2' }
  ]);
  setDiscoveredOpenCodeModels([
    { id: 'opencode/free-1', name: 'Free 1', provider: 'opencode', isFree: true },
    { id: 'opencode/free-2', name: 'Free 2', provider: 'opencode', isFree: true }
  ]);

  // 1. Intra-provider failover within Antigravity
  const runtime1 = createGeminiRuntime({
    isAntigravityInstalled: async () => true,
    isOpenCodeInstalled: async () => true,
    isCliAgentInstalled: async () => false,
    isOllamaReachable: async () => false
  });
  runtime1.setActiveAiProvider('antigravity');
  runtime1.setActiveAntigravityModel('ag-model-1');

  const attemptedModels1 = [];
  const res1 = await runtime1.executeWithKeyFailover(async (service, meta) => {
    attemptedModels1.push(`${meta.provider}:${service.modelName}`);
    if (service.modelName === 'ag-model-1') {
      throw new Error('ag-model-1 unavailable');
    }
    return 'ok-from-ag-2';
  });
  assert.equal(res1, 'ok-from-ag-2');
  assert.deepEqual(attemptedModels1, ['antigravity:ag-model-1', 'antigravity:ag-model-2']);

  // 2. Cross-provider failover: Antigravity models all fail -> routes to OpenCode and tries its models
  const runtime2 = createGeminiRuntime({
    isAntigravityInstalled: async () => true,
    isOpenCodeInstalled: async () => true,
    isCliAgentInstalled: async () => false,
    isOllamaReachable: async () => false
  });
  runtime2.setActiveAiProvider('antigravity');
  runtime2.setActiveAntigravityModel('ag-model-1');
  runtime2.setActiveOpenCodeModel('opencode/free-1');

  const attemptedModels2 = [];
  const res2 = await runtime2.executeWithKeyFailover(async (service, meta) => {
    attemptedModels2.push(`${meta.provider}:${service.modelName}`);
    if (meta.provider === 'antigravity' || service.modelName === 'opencode/free-1') {
      throw new Error(`${service.modelName} unavailable`);
    }
    return 'ok-from-opencode-2';
  });
  assert.equal(res2, 'ok-from-opencode-2');
  assert.deepEqual(attemptedModels2, [
    'antigravity:ag-model-1',
    'antigravity:ag-model-2',
    'opencode:opencode/free-1',
    'opencode:opencode/free-2'
  ]);
});

test('buildAskAiSessionPrompt includes candidate profile grounding and structured teleprompter format', () => {
  const prompt = buildAskAiSessionPrompt({
    contextString: 'Host: How do you scale microservices?',
    programmingLanguage: 'Python',
    candidateResume: 'Built high-throughput payment pipelines handling 10k RPS at Fintech Corp.',
    jobDescription: 'Senior Backend Engineer: Microservices, Distributed Systems.'
  });

  assert.ok(prompt.includes('CANDIDATE RESUME & EXPERIENCE'), 'Prompt should include resume context block');
  assert.ok(prompt.includes('TARGET JOB DESCRIPTION'), 'Prompt should include job description block');
  assert.ok(prompt.includes('Fintech Corp'), 'Prompt should ground answers in candidate background');
  assert.ok(prompt.includes('🎯 Question:'), 'Prompt should specify 🎯 Question structure');
  assert.ok(prompt.includes('Say this (Opening):'), 'Prompt should specify Say this (Opening) structure');
});

test('buildSuggestResponsePrompt filters small talk and personalizes with candidate background', () => {
  const prompt = buildSuggestResponsePrompt({
    context: 'Meeting start',
    contextString: 'Host: Hello, glad to connect!',
    programmingLanguage: 'JavaScript',
    candidateResume: 'Staff Engineer with 8 years of React & Node experience',
    jobDescription: 'Full Stack Tech Lead'
  });

  assert.ok(prompt.includes('Staff Engineer with 8 years'), 'Prompt should ground suggestions in candidate background');
  assert.ok(prompt.includes('SMALL TALK / GREETING'), 'Prompt should detect small talk vs technical question');
  assert.ok(prompt.includes('Say this (Opening):'), 'Prompt should include spoken opening teleprompter line');
});

test('buildAskAiSessionPrompt includes OA Mode directives when enabled', () => {
  const prompt = buildAskAiSessionPrompt({
    contextString: 'Host: Solve Two Sum in O(n) time',
    programmingLanguage: 'Python',
    oaModeEnabled: true
  });

  assert.ok(prompt.includes('ONLINE ASSESSMENT (OA / LEETCODE / MCQ)'), 'Prompt must contain OA directive when enabled');
  assert.ok(prompt.includes('compilable code solution'), 'Prompt must require compilable code solution');
});
