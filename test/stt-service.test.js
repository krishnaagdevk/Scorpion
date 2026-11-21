const test = require('node:test');
const assert = require('node:assert/strict');
const { WindowsSpeechService } = require('../src/services/stt/windows-speech-service');
const { createAssemblyAiService } = require('../src/services/assembly-ai/service');

test('WindowsSpeechService has expected interface', () => {
  const service = new WindowsSpeechService();
  assert.equal(typeof service.start, 'function');
  assert.equal(typeof service.stop, 'function');
  assert.equal(typeof service.isActive, 'function');
  assert.equal(service.isActive(), false);
});

test('AssemblyAI service seamlessly falls back to Windows Speech when no API key configured', () => {
  const sentMessages = [];
  const fakeSendToRenderer = (channel, data) => {
    sentMessages.push({ channel, data });
  };

  const service = createAssemblyAiService({
    WebSocket: class FakeWebSocket {},
    desktopCapturer: {},
    getAssemblyApiKey: () => null, // No API key configured
    getSpeechModel: () => 'nano',
    getGeminiService: () => null,
    sendToRenderer: fakeSendToRenderer
  });

  const res = service.startAssemblyAiStream('mic');
  // Should succeed via Windows native speech fallback, not error out with "AssemblyAI API key not configured"
  assert.equal(res.success, true);
  
  // Clean up
  service.stopVoiceRecognition({ source: 'mic' });
});
