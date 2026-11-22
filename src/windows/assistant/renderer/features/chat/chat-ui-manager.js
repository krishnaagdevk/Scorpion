export function createChatUiManager({
    chatContainer,
    chatMessagesElement,
    chatComposer,
    chatManualInput,
    chatManualSend,
    messageStore,
    maxChatInputHeight,
    escapeHtml,
    updateUi,
    onMessagesChanged,
    showFeedback,
    addMonitorLog,
    isAutoScrollEnabled = () => true,
    onMessageSubmitted
}) {
    function autoRepairIncompleteMarkdown(text) {
        if (!text) return '';
        let sanitized = String(text);

        // Check for unclosed code fence (odd count of ```)
        const codeFences = (sanitized.match(/```/g) || []).length;
        if (codeFences % 2 !== 0) {
            sanitized += '\n```';
        }

        // Check for unclosed bold markers (odd count of **)
        const boldMarkers = (sanitized.match(/\*\*/g) || []).length;
        if (boldMarkers % 2 !== 0) {
            sanitized += '**';
        }

        return sanitized;
    }

    function formatResponse(text, isStreaming = false) {
        if (!text) return '';
        const workingText = isStreaming ? autoRepairIncompleteMarkdown(text) : String(text);

        let formatted = workingText
            .replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, lang, code) => {
                const displayLang = lang || 'code';
                return `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang">${displayLang}</span><button class="copy-code-btn" type="button">Copy Code</button></div><pre><code class="language-${displayLang}">${code}</code></pre></div>`;
            })
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Teleprompter Say this (Opening / Headline / Direct)
        formatted = formatted.replace(
            /(?:<strong>)?(?:[💬🎙️]\s*)?Say this(?:\s*\([^)]+\))?:?(?:<\/strong>)?:?\s*(?:<br>|\n)*([“"'][^<>\n]+[”"']|[^\n<]+(?=\n\n|<br><br>|<strong>|$))/i,
            '<div class="teleprompter-say-this"><div class="teleprompter-say-header"><span class="say-icon">🎙️</span><span>Say this (Opening)</span></div><div class="teleprompter-say-body">$1</div></div>'
        );

        // Teleprompter Question detected
        formatted = formatted.replace(
            /(?:<strong>)?🎯\s*Question:?(?:<\/strong>)?:?\s*([^<\n]+)/i,
            '<div class="teleprompter-question"><span class="teleprompter-badge">🎯 Question</span><span class="teleprompter-qtext">$1</span></div>'
        );

        // Teleprompter /btw Quick Answer detected
        formatted = formatted.replace(
            /(?:<strong>)?💬\s*\/btw\s*(?:Quick Answer)?:?(?:<\/strong>)?:?/i,
            '<div class="teleprompter-say-header"><span class="say-icon">💬</span><span class="btw-badge">/btw Quick Answer</span></div>'
        );

        formatted = formatted.replace(/\n/g, '<br>');

        if (isStreaming) {
            formatted += '<span class="streaming-cursor" aria-hidden="true"></span>';
        }

        return formatted;
    }

    function isChatNearBottom(threshold = 28) {
        if (!chatMessagesElement) {
            return true;
        }

        const distanceFromBottom =
            chatMessagesElement.scrollHeight - chatMessagesElement.clientHeight - chatMessagesElement.scrollTop;
        return distanceFromBottom <= threshold;
    }

    function addChatMessage(type, content, options = {}) {
        if (!chatMessagesElement) {
            return null;
        }

        const shouldAutoScroll = isChatNearBottom();

        const timestampDate = new Date();
        const record = messageStore.add(type, content, {
            id: options.id,
            timestamp: timestampDate,
            canToggleAi: options.canToggleAi,
            includeInAi: options.includeInAi,
            screenshotId: options.screenshotId
        });

        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${type}-message`;
        messageDiv.dataset.messageId = record.id;
        if (record.canToggleAi) {
            messageDiv.classList.add('ai-toggleable');
            messageDiv.classList.add(record.includeInAi ? 'ai-included' : 'ai-excluded');
        }

        const timestamp = timestampDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        let icon = '\u2139\uFE0F';
        let label = '';
        let contentClass = 'message-content';
        let safeContent = escapeHtml(content);

        switch (type) {
            case 'voice':
            case 'voice-mic':
                icon = '\u{1F3A4}';
                label = 'You';
                break;

            case 'voice-system':
                icon = '\u{1F50A}';
                label = 'Host';
                break;

            case 'screenshot':
                icon = '\u{1F4F8}';
                break;

            case 'ai-response':
                icon = '\u{1F916}';
                contentClass = 'message-content ai-response';
                safeContent = formatResponse(content);
                break;

            case 'system':
                icon = '\u2139\uFE0F';
                contentClass = 'message-content system-message';
                break;
        }

        const labelHtml = label ? `<span class="message-label">${label}</span>` : '';
        const toggleHtml = record.canToggleAi
            ? `<button class="ai-include-toggle ${record.includeInAi ? 'included' : 'excluded'}" data-message-id="${record.id}" type="button" aria-label="Toggle AI context" aria-pressed="${record.includeInAi ? 'true' : 'false'}">${record.includeInAi ? '-' : '+'}</button>`
            : '';
        const copyHtml = `<button class="message-copy-btn" data-message-id="${record.id}" type="button" aria-label="Copy message"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>`;
        const messageActionsHtml = `<span class="message-actions">${toggleHtml}${copyHtml}</span>`;
        const exclusionHtml = record.canToggleAi
            ? '<div class="ai-excluded-note">Excluded from AI context</div>'
            : '';

        const messageContent = `
        <div class="message-header">
            <span class="message-icon">${icon}</span>
            ${labelHtml}
            ${messageActionsHtml}
            <span class="message-time">${timestamp}</span>
        </div>
        <div class="${contentClass}">${exclusionHtml}${safeContent}</div>
    `;

        messageDiv.innerHTML = messageContent;
        chatMessagesElement.appendChild(messageDiv);

        if (shouldAutoScroll && isAutoScrollEnabled()) {
            chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
        }

        onMessagesChanged?.(messageStore.getMessages());
        updateUi?.();

        return record;
    }

    function updateChatComposerHeight() {
        if (!chatContainer || !chatComposer) {
            return;
        }

        // Remove the variable first so the min-height constraint is cleared,
        // allowing getBoundingClientRect to return the natural content height
        // instead of being held at the previous (potentially stale) large value.
        chatContainer.style.removeProperty('--chat-composer-height');
        const composerHeight = Math.max(0, Math.round(chatComposer.getBoundingClientRect().height));
        if (composerHeight > 0) {
            chatContainer.style.setProperty('--chat-composer-height', `${composerHeight}px`);
        }
    }

    function autoResizeManualInput() {
        if (!chatManualInput) {
            return;
        }

        chatManualInput.style.height = 'auto';
        const nextHeight = Math.min(chatManualInput.scrollHeight, maxChatInputHeight);
        chatManualInput.style.height = `${Math.max(24, nextHeight)}px`;
        chatManualInput.style.overflowY = chatManualInput.scrollHeight > maxChatInputHeight ? 'auto' : 'hidden';
        updateChatComposerHeight();
    }

    function updateManualComposerState() {
        if (!chatManualInput || !chatManualSend) {
            return;
        }

        chatManualSend.disabled = String(chatManualInput.value || '').trim().length === 0;
    }

    function updateChatMessageContent(messageId, newContent, options = {}) {
        const isStreaming = Boolean(options?.isStreaming);
        const record = messageStore.findById(messageId);
        if (record) {
            record.content = newContent;
        }

        if (!chatMessagesElement) return;

        const messageEl = chatMessagesElement.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageEl) return;

        const contentEl = messageEl.querySelector('.message-content');
        if (!contentEl) return;

        const shouldAutoScroll = isChatNearBottom();
        contentEl.innerHTML = formatResponse(newContent, isStreaming);

        if (shouldAutoScroll && isAutoScrollEnabled()) {
            chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
        }
    }

    function createStreamingSession(messageId) {
        let targetText = '';
        let displayedText = '';
        let animFrameId = null;
        let isFinalized = false;

        function tick() {
            if (displayedText.length < targetText.length) {
                const remaining = targetText.length - displayedText.length;
                // High-performance streaming for live interviews:
                // Instantly catch up with streamed tokens (at least 20-50 chars per frame, or entire backlog if > 150)
                const step = remaining > 150 ? remaining : (remaining > 50 ? 30 : (remaining > 15 ? 15 : remaining));
                const nextLength = Math.min(targetText.length, displayedText.length + step);
                displayedText = targetText.slice(0, nextLength);

                const stillStreaming = !isFinalized || displayedText.length < targetText.length;
                updateChatMessageContent(messageId, displayedText, { isStreaming: stillStreaming });

                animFrameId = requestAnimationFrame(tick);
            } else if (isFinalized) {
                // Done rendering complete response, remove blinking streaming cursor
                updateChatMessageContent(messageId, targetText, { isStreaming: false });
                animFrameId = null;
            } else {
                animFrameId = null;
            }
        }

        function appendChunk(deltaText) {
            if (!deltaText) return;
            targetText += deltaText;
            if (!animFrameId) {
                animFrameId = requestAnimationFrame(tick);
            }
        }

        function complete(finalText) {
            isFinalized = true;
            if (typeof finalText === 'string' && finalText.length > 0) {
                targetText = finalText;
            }
            if (!animFrameId) {
                animFrameId = requestAnimationFrame(tick);
            }
        }

        function abort() {
            if (isFinalized) return;
            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }
        }

        return { appendChunk, complete, abort };
    }

    function submitManualContextMessage() {
        if (!chatManualInput) {
            return;
        }

        const text = String(chatManualInput.value || '').trim();
        if (!text) {
            showFeedback?.('Type or speak a question first', 'error');
            return;
        }

        addChatMessage('voice-mic', text);
        addMonitorLog?.('info', 'manual-context-added', 'Manual question added', 'mic', {
            chars: text.length
        });
        showFeedback?.('Processing parallel /btw answer...', 'info');

        chatManualInput.value = '';
        autoResizeManualInput();
        updateManualComposerState();
        chatManualInput.focus();

        if (typeof onMessageSubmitted === 'function') {
            onMessageSubmitted(text);
        }
    }

    return {
        addChatMessage,
        updateChatMessageContent,
        createStreamingSession,
        autoResizeManualInput,
        submitManualContextMessage,
        updateManualComposerState,
        isChatNearBottom
    };
}
