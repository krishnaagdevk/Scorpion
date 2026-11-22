export function isTranscriptMessageType(type) {
  return type === 'voice' || type === 'voice-mic' || type === 'voice-system';
}

export function isScreenshotMessageType(type) {
  return type === 'screenshot';
}

export function isSystemMessageType(type) {
  return type === 'system';
}

export function isAiResponseMessageType(type) {
  return type === 'ai-response';
}

export function canToggleAiForMessageType(type) {
  return isTranscriptMessageType(type) || isScreenshotMessageType(type) || isAiResponseMessageType(type);
}

export function defaultIncludeInAiForMessageType(type) {
  if (isSystemMessageType(type)) {
    return false;
  }
  return true;
}

export function contextLineForMessage(message) {
  const content = String(message?.content || '').trim();
  if (!content) return '';

  if (message.type === 'voice-system') return `[Interviewer] (Host): ${content}`;
  if (message.type === 'voice' || message.type === 'voice-mic') return `[Candidate] (You): ${content}`;
  if (message.type === 'screenshot') {
    return message.screenshotId
      ? `Screenshot(${message.screenshotId}): ${content}`
      : `Screenshot: ${content}`;
  }
  if (message.type === 'ai-response') return `AI: ${content}`;
  return '';
}

export function summaryLineForMessage(message) {
  const content = String(message?.content || '').trim().replace(/\s+/g, ' ');
  if (!content) return '';

  if (message.type === 'voice-system') return `[Interviewer] said: ${content}`;
  if (message.type === 'voice' || message.type === 'voice-mic') return `[Candidate] said: ${content}`;
  if (message.type === 'screenshot') return `Screenshot: ${content}`;
  if (message.type === 'ai-response') return `AI response: ${content}`;
  return '';
}
