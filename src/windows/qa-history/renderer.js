// ============================================================================
// Q&A COMPANION WINDOW RENDERER - Open-Cluely
// ============================================================================

let allItems = [];
let deletedStack = [];
let activeFilter = 'all';
let searchQuery = '';
let isAlwaysOnTop = false;

// DOM Elements
const qaFeed = document.getElementById('qa-feed');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const searchClearBtn = document.getElementById('search-clear-btn');
const filterPills = document.querySelectorAll('.filter-pill');
const countAll = document.getElementById('count-all');
const countCode = document.getElementById('count-code');
const countVoice = document.getElementById('count-voice');
const statsSummary = document.getElementById('stats-summary');
const closeBtn = document.getElementById('close-btn');
const pinBtn = document.getElementById('pin-btn');
const ghostBtn = document.getElementById('ghost-btn');
const redoBtn = document.getElementById('redo-btn');
const clearBtn = document.getElementById('clear-btn');
let isGhostMode = false;

function updateGhostBtnState() {
  if (!ghostBtn) return;
  ghostBtn.classList.toggle('active', isGhostMode);
  ghostBtn.setAttribute('aria-pressed', isGhostMode ? 'true' : 'false');
  ghostBtn.setAttribute('title', isGhostMode
    ? 'Ghost Mode Active (Alt+Shift+P): Clicks pass directly to VS Code / Notepad'
    : 'Ghost Mode (Alt+Shift+P): Click & type directly in VS Code / Notepad through this window');
}
const recallToast = document.getElementById('recall-toast');
const recallToastMsg = document.getElementById('recall-toast-msg');
const recallToastBtn = document.getElementById('recall-toast-btn');

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractQuestionTitle(rawQuestion, answerText) {
  // 1. Check if AI explicitly identified and extracted the question under **🎯 Question:** or 🎯 Question:
  if (answerText) {
    const aiQMatch = answerText.match(/(?:\*{0,2}🎯\s*Question:\*{0,2}|🎯\s*Question:?)\s*([^\n\r]+)/i);
    if (aiQMatch && aiQMatch[1] && aiQMatch[1].trim().length > 3) {
      return aiQMatch[1].trim();
    }
  }

  const str = String(rawQuestion || '').trim();
  if (!str) return 'Interview Question';

  if (/^screen solution analysis$/i.test(str)) {
    return 'Screen Problem Analysis (Code / OA)';
  }

  // 2. Remove speech-to-text speaker prefixes
  let cleaned = str
    .replace(/^\[(?:Speaker|Host|Interviewer)\s*\d*\]:?\s*/i, '')
    .replace(/^(?:Interviewer|Host|Candidate):\s*/i, '')
    .replace(/^Transcript:\s*/i, '')
    .trim();

  // 3. Strip conversational speech filler
  cleaned = cleaned.replace(/^(?:um+|uh+|so+|like+|yeah+|ok+|okay+|well+|hey+|hi+|hello)\s*,?\s*/i, '');
  cleaned = cleaned.replace(/^(?:can you|could you|please|tell me|explain to me|i wanted to ask|i want to know|let's talk about)\s*,?\s*/i, '');

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    if (/^(?:how|what|why|where|when|which|who|can|could|would|should|is|are|do|does)\b/i.test(cleaned) && !/[?.!]$/.test(cleaned)) {
      cleaned += '?';
    }
    return cleaned;
  }

  return str;
}

function formatInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong class="keyword-highlight">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
}

function formatAnswerContent(text, status = 'completed') {
  if (!text) {
    return `
      <div class="teleprompter-loading-state">
        <div class="teleprompter-pulse-bar">
          <span class="pulse-spark">⚡</span>
          <span>Identifying interview question & crafting targeted solution...</span>
        </div>
      </div>
    `;
  }

  // 1. Extract Code Blocks into tokens first so inner contents are protected
  const codeBlocks = [];
  let processed = text.replace(/```([a-zA-Z0-9_\-+]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang || 'code', code: code.trim() });
    return `__CODE_BLOCK_${idx}__`;
  });

  // 2. Strip out duplicate **🎯 Question:** from the body since it's displayed in the top header
  processed = processed.replace(/(?:\*{0,2}🎯\s*Question:\*{0,2}|🎯\s*Question:?)\s*[^\n\r]+(?:\r?\n)*/gi, '');

  // 3. Extract "Say this (Opening / Headline / Direct / Spoken story)" into a standout teleprompter card
  let sayThisCard = '';
  const sayThisMatch = processed.match(
    /(?:\*{0,2}[🎙️💬]?\s*Say\s+this(?:\s*\([^)]+\))?:?\*{0,2}:?\s*)(?:<br>|\n)*([“"'][^<>\n\r]+[”"']|[^\n\r]+(?=\r?\n\r?\n|\*{0,2}[A-Z]|$))/i
  );
  if (sayThisMatch) {
    const rawSayText = sayThisMatch[1].replace(/^[“"']+|[”"']+$/g, '').trim();
    sayThisCard = `
      <div class="teleprompter-say-card">
        <div class="say-header">
          <span class="say-icon">🎙️</span>
          <span class="say-label">SAY THIS OUT LOUD (Instant Spoken Answer)</span>
          <span class="say-badge">First 5 Seconds</span>
        </div>
        <div class="say-quote">"${escapeHtml(rawSayText)}"</div>
      </div>
    `;
    processed = processed.replace(sayThisMatch[0], '');
  }

  // 4. Extract "Complexity:"
  let complexityPills = '';
  const complexityMatch = processed.match(
    /(?:\*{0,2}Complexity:\*{0,2}:?\s*)([^\n\r]+)/i
  );
  if (complexityMatch) {
    const compText = complexityMatch[1].trim();
    const timeMatch = compText.match(/Time\s*[:=]?\s*([O0]\([^)]+\)|[^\s|;,]+)/i);
    const spaceMatch = compText.match(/Space\s*[:=]?\s*([O0]\([^)]+\)|[^\s|;,]+)/i);

    let pillsHtml = '';
    if (timeMatch) {
      pillsHtml += `<span class="metric-pill time"><span class="metric-icon">⏱️</span><strong>Time:</strong> ${escapeHtml(timeMatch[1])}</span>`;
    }
    if (spaceMatch) {
      pillsHtml += `<span class="metric-pill space"><span class="metric-icon">💾</span><strong>Space:</strong> ${escapeHtml(spaceMatch[1])}</span>`;
    }
    if (!pillsHtml) {
      pillsHtml = `<span class="metric-pill generic"><span class="metric-icon">⚡</span>${escapeHtml(compText)}</span>`;
    }

    complexityPills = `
      <div class="teleprompter-metrics-bar">
        ${pillsHtml}
      </div>
    `;
    processed = processed.replace(complexityMatch[0], '');
  }

  // 5. Extract "Edge cases to mention:" or "Key Trade-offs:"
  let callouts = '';
  processed = processed.replace(
    /(?:\*{0,2}(Edge cases to mention|Key Trade-offs|Important Note|Gotchas):\*{0,2}:?\s*)([^\n\r]+(?:\r?\n(?:[-*•]|\s{2,})[^\n\r]+)*)/gi,
    (_m, label, content) => {
      callouts += `
        <div class="teleprompter-callout-card">
          <div class="callout-header">
            <span class="callout-icon">💡</span>
            <span class="callout-title">${escapeHtml(label)}</span>
          </div>
          <div class="callout-body">${escapeHtml(content.trim())}</div>
        </div>
      `;
      return '';
    }
  );

  // 6. Section headers (Approach:, Architecture & Components:, Data Flow:, Talking points:, Deep dive:)
  processed = processed.replace(
    /(?:\*{0,2}(Approach|Architecture & Components|Data Flow|Talking points|Deep dive|Key Points|Solution Framework):\*{0,2}:?)/gi,
    (_m, title) => {
      return `\n<div class="teleprompter-section-header"><span class="section-icon">📋</span><span class="section-title">${escapeHtml(title)}</span></div>\n`;
    }
  );

  // 7. Parse lists (bullet points)
  const lines = processed.split(/\r?\n/);
  const formattedLines = [];
  let inList = false;

  for (let line of lines) {
    const bulletMatch = line.match(/^(\s*)(?:[-*•]|\d+\.)\s+(.+)$/);
    if (bulletMatch) {
      if (!inList) {
        formattedLines.push('<ul class="teleprompter-bullets">');
        inList = true;
      }
      formattedLines.push(`<li class="teleprompter-bullet-item"><span class="bullet-glow"></span><span class="bullet-text">${formatInlineMarkdown(bulletMatch[2])}</span></li>`);
    } else {
      if (inList) {
        formattedLines.push('</ul>');
        inList = false;
      }
      if (line.trim().length > 0) {
        if (line.includes('__CODE_BLOCK_') || line.includes('class="teleprompter-section-header"')) {
          formattedLines.push(line);
        } else {
          formattedLines.push(`<p class="teleprompter-para">${formatInlineMarkdown(line)}</p>`);
        }
      }
    }
  }
  if (inList) {
    formattedLines.push('</ul>');
  }

  let finalBody = formattedLines.join('\n');

  // 8. Re-inject Code Blocks
  finalBody = finalBody.replace(/__CODE_BLOCK_(\d+)__/g, (_match, idx) => {
    const block = codeBlocks[Number(idx)];
    if (!block) return '';
    return `
      <div class="qa-code-block">
        <div class="code-header">
          <span class="code-lang-pill">${escapeHtml((block.lang || 'CODE').toUpperCase())}</span>
          <button class="action-pill-btn copy-code-btn" data-code="${encodeURIComponent(block.code)}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            Copy Code
          </button>
        </div>
        <pre class="code-content"><code>${escapeHtml(block.code)}</code></pre>
      </div>
    `;
  });

  const streamingCursor = status === 'evaluating'
    ? '<span class="teleprompter-streaming-cursor">▌</span>'
    : '';

  return `
    ${sayThisCard}
    ${finalBody}
    ${complexityPills}
    ${callouts}
    ${streamingCursor}
  `.trim();
}

function renderCard(item, index) {
  const card = document.createElement('article');
  card.className = 'qa-card';
  card.id = `qa-card-${item.id}`;
  card.dataset.id = item.id;
  card.dataset.hasCode = item.hasCode ? 'true' : 'false';
  card.dataset.source = item.source || 'voice';

  const dateObj = item.timestamp ? new Date(item.timestamp) : new Date();
  const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const isCode = item.hasCode || /```/.test(item.answer || '');
  const tagClass = isCode ? 'code' : (item.source === 'screen' ? 'screen' : 'voice');
  const tagLabel = isCode ? 'Code / OA' : (item.source === 'screen' ? 'Screen OCR' : 'Live Audio');

  const isEvaluating = item.status === 'evaluating' || !item.answer;
  const statusClass = isEvaluating ? 'evaluating' : 'completed';
  const statusLabel = isEvaluating ? '⚡ Generating Answer...' : '✓ Solution Ready';

  const extractedQuestion = extractQuestionTitle(item.question, item.answer);
  const hasRawContext = item.question && item.question.trim() !== extractedQuestion.trim();

  card.innerHTML = `
    <header class="qa-card-header">
      <div class="card-meta-left">
        <span class="card-num">#${index + 1}</span>
        <span class="card-tag ${tagClass}">${tagLabel}</span>
        <span class="card-status-badge ${statusClass}" id="status-badge-${item.id}">${statusLabel}</span>
        <span class="card-time">${timeStr}</span>
      </div>
      <div class="card-actions">
        <button class="action-pill-btn copy-answer-btn" data-id="${item.id}" title="Copy complete answer">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          <span>Copy</span>
        </button>
        <button class="action-pill-btn delete-card-btn" data-id="${item.id}" title="Remove question (can recall anytime)">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
    </header>

    <div class="identified-question-card">
      <div class="question-header-row">
        <div class="question-identification-label">
          <span class="pulse-dot"></span>
          <span>TARGET QUESTION IDENTIFIED</span>
        </div>
        ${hasRawContext ? `<button class="raw-transcript-toggle" data-target="raw-q-${item.id}">View Raw Transcript</button>` : ''}
      </div>
      <div class="identified-question-title" id="question-text-${item.id}">
        ${escapeHtml(extractedQuestion)}
      </div>
      ${hasRawContext ? `<div class="raw-transcript-body hidden" id="raw-q-${item.id}">${escapeHtml(item.question)}</div>` : ''}
    </div>

    <div class="teleprompter-answer-container">
      <div class="answer-header-row">
        <div class="answer-badge-title">
          <span class="ai-sparkle-icon">💡</span>
          <span>TELEPROMPTER AI ANSWER</span>
        </div>
        <span class="model-name-chip">gemini-3.8-flash-low</span>
      </div>
      <div class="answer-content-body" id="answer-content-${item.id}">
        ${formatAnswerContent(item.answer, item.status)}
      </div>
    </div>
  `;

  return card;
}

function updateCounts() {
  const total = allItems.length;
  const codeCount = allItems.filter(i => i.hasCode || /```/.test(i.answer || '')).length;
  const voiceCount = allItems.filter(i => i.source === 'voice' || !i.source).length;

  if (countAll) countAll.textContent = total;
  if (countCode) countCode.textContent = codeCount;
  if (countVoice) countVoice.textContent = voiceCount;
  if (statsSummary) statsSummary.textContent = `${total} Q&A pairs recorded`;
}

function applyFilters() {
  const query = searchQuery.trim().toLowerCase();
  let visibleCount = 0;

  const cards = qaFeed.querySelectorAll('.qa-card');
  cards.forEach(card => {
    const id = card.dataset.id;
    const item = allItems.find(i => String(i.id) === String(id));
    if (!item) return;

    const matchesFilter =
      activeFilter === 'all' ||
      (activeFilter === 'code' && (item.hasCode || /```/.test(item.answer || ''))) ||
      (activeFilter === 'voice' && (item.source === 'voice' || !item.source));

    const matchesSearch =
      !query ||
      (item.question && item.question.toLowerCase().includes(query)) ||
      (item.answer && item.answer.toLowerCase().includes(query));

    if (matchesFilter && matchesSearch) {
      card.style.display = 'block';
      visibleCount += 1;
    } else {
      card.style.display = 'none';
    }
  });

  if (emptyState) {
    if (allItems.length === 0) {
      emptyState.style.display = 'flex';
      emptyState.querySelector('h3').textContent = 'No Questions Answered Yet';
      emptyState.querySelector('p').textContent = 'When the interviewer speaks or you trigger Ask AI, complete questions and code solutions will automatically populate here.';
    } else if (visibleCount === 0) {
      emptyState.style.display = 'flex';
      emptyState.querySelector('h3').textContent = 'No Matches Found';
      emptyState.querySelector('p').textContent = `No Q&A pairs matched your search "${searchQuery}".`;
    } else {
      emptyState.style.display = 'none';
    }
  }
}

function renderAllItems() {
  qaFeed.querySelectorAll('.qa-card').forEach(c => c.remove());

  allItems.forEach((item, index) => {
    const card = renderCard(item, index);
    qaFeed.appendChild(card);
  });

  updateCounts();
  applyFilters();
}

function updateRedoButtonState() {
  if (!redoBtn) return;
  if (deletedStack.length > 0) {
    redoBtn.classList.remove('hidden');
    redoBtn.setAttribute('title', `Recall Removed Questions (${deletedStack.length} in buffer)`);
  } else {
    redoBtn.classList.add('hidden');
  }
}

let toastTimeout = null;
function showRecallToast(message) {
  if (!recallToast || !recallToastMsg) return;
  recallToastMsg.textContent = message;
  recallToast.classList.remove('hidden');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    hideRecallToast();
  }, 7000);
}

function hideRecallToast() {
  if (recallToast) recallToast.classList.add('hidden');
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }
}

async function performRecall() {
  if (deletedStack.length === 0) return;
  const itemsToRestore = deletedStack.pop();
  if (Array.isArray(itemsToRestore) && itemsToRestore.length > 0) {
    const existingIds = new Set(allItems.map(i => String(i.id)));
    for (const it of itemsToRestore) {
      if (!existingIds.has(String(it.id))) {
        allItems.unshift(it);
        existingIds.add(String(it.id));
      }
    }
    renderAllItems();
    updateRedoButtonState();
    hideRecallToast();
    await window.qaApi?.restoreQaItems?.(itemsToRestore);
  }
}

// Event Listeners
function setupListeners() {
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.qaApi?.closeQaWindow?.();
    });
  }

  if (pinBtn) {
    pinBtn.addEventListener('click', () => {
      isAlwaysOnTop = !isAlwaysOnTop;
      pinBtn.classList.toggle('active', isAlwaysOnTop);
      pinBtn.setAttribute('aria-pressed', isAlwaysOnTop ? 'true' : 'false');
      window.qaApi?.toggleAlwaysOnTop?.(isAlwaysOnTop);
    });
  }

  if (ghostBtn) {
    ghostBtn.addEventListener('click', async () => {
      const res = await window.qaApi?.toggleClickThrough?.();
      if (typeof res?.clickThroughEnabled === 'boolean') {
        isGhostMode = res.clickThroughEnabled;
        updateGhostBtnState();
      }
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener('click', () => {
      performRecall();
    });
  }

  if (recallToastBtn) {
    recallToastBtn.addEventListener('click', () => {
      performRecall();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      // No confirmation prompt! Immediate removal with instant redo/recall buffer
      if (allItems.length > 0) {
        deletedStack.push([...allItems]);
        allItems = [];
        renderAllItems();
        updateRedoButtonState();
        showRecallToast('Cleared all questions');
        await window.qaApi?.clearQaHistory?.();
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (searchClearBtn) {
        searchClearBtn.classList.toggle('hidden', !searchQuery);
      }
      applyFilters();
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      searchClearBtn.classList.add('hidden');
      applyFilters();
      searchInput.focus();
    });
  }

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilter = pill.dataset.filter || 'all';
      applyFilters();
    });
  });

  // Delegate copy button clicks, delete card clicks, & raw transcript toggle
  qaFeed.addEventListener('click', async (e) => {
    const deleteCardBtn = e.target.closest('.delete-card-btn');
    if (deleteCardBtn) {
      const id = deleteCardBtn.dataset.id;
      const targetIdx = allItems.findIndex(i => String(i.id) === String(id));
      if (targetIdx >= 0) {
        const [removedItem] = allItems.splice(targetIdx, 1);
        deletedStack.push([removedItem]);
        renderAllItems();
        updateRedoButtonState();
        const shortQ = (removedItem.question || 'Question').slice(0, 30);
        showRecallToast(`Removed "${shortQ}..."`);
        window.qaApi?.deleteQaItem?.(id);
      }
      return;
    }

    const rawToggleBtn = e.target.closest('.raw-transcript-toggle');
    if (rawToggleBtn) {
      const targetId = rawToggleBtn.dataset.target;
      const rawBody = document.getElementById(targetId);
      if (rawBody) {
        rawBody.classList.toggle('hidden');
        rawToggleBtn.textContent = rawBody.classList.contains('hidden') ? 'View Raw Transcript' : 'Hide Raw Transcript';
      }
      return;
    }

    const copyCodeBtn = e.target.closest('.copy-code-btn');
    if (copyCodeBtn) {
      const code = decodeURIComponent(copyCodeBtn.dataset.code || '');
      try {
        await navigator.clipboard.writeText(code);
        const originalHtml = copyCodeBtn.innerHTML;
        copyCodeBtn.classList.add('copied');
        copyCodeBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyCodeBtn.classList.remove('copied');
          copyCodeBtn.innerHTML = originalHtml;
        }, 1500);
      } catch (err) {
        console.error('Clipboard copy failed:', err);
      }
      return;
    }

    const copyAnswerBtn = e.target.closest('.copy-answer-btn');
    if (copyAnswerBtn) {
      const id = copyAnswerBtn.dataset.id;
      const item = allItems.find(i => String(i.id) === String(id));
      if (item && item.answer) {
        try {
          await navigator.clipboard.writeText(item.answer);
          const originalText = copyAnswerBtn.textContent;
          copyAnswerBtn.classList.add('copied');
          copyAnswerBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyAnswerBtn.classList.remove('copied');
            copyAnswerBtn.textContent = originalText;
          }, 1500);
        } catch (err) {
          console.error('Clipboard copy failed:', err);
        }
      }
    }
  });

  // Listen for real-time IPC updates from main process
  if (window.qaApi) {
    window.qaApi.onQaItemAdded((item) => {
      const existingIdx = allItems.findIndex(i => String(i.id) === String(item.id));
      if (existingIdx >= 0) {
        allItems[existingIdx] = { ...allItems[existingIdx], ...item };
        const oldCard = document.getElementById(`qa-card-${item.id}`);
        if (oldCard) {
          const newCard = renderCard(allItems[existingIdx], existingIdx);
          qaFeed.replaceChild(newCard, oldCard);
        }
      } else {
        allItems.unshift(item);
        const card = renderCard(item, 0);
        card.classList.add('live-active');
        qaFeed.prepend(card);
      }
      updateCounts();
      applyFilters();
      // Scroll to top for newest live answer
      qaFeed.scrollTop = 0;
    });

    window.qaApi.onQaAnswerChunk((data) => {
      const item = allItems.find(i => String(i.id) === String(data.id));
      if (item) {
        item.answer = (item.answer || '') + (data.chunk || '');
        item.status = 'evaluating';
        const elem = document.getElementById(`answer-content-${item.id}`);
        if (elem) {
          elem.innerHTML = formatAnswerContent(item.answer, 'evaluating');
        }
        const qElem = document.getElementById(`question-text-${item.id}`);
        if (qElem) {
          qElem.textContent = extractQuestionTitle(item.question, item.answer);
        }
        const badgeElem = document.getElementById(`status-badge-${item.id}`);
        if (badgeElem && !badgeElem.classList.contains('evaluating')) {
          badgeElem.className = 'card-status-badge evaluating';
          badgeElem.textContent = '⚡ Generating Answer...';
        }
        const card = document.getElementById(`qa-card-${item.id}`);
        if (card && !card.classList.contains('live-active')) {
          card.classList.add('live-active');
        }
      }
    });

    window.qaApi.onQaAnswerComplete((data) => {
      const item = allItems.find(i => String(i.id) === String(data.id));
      if (item) {
        item.answer = data.answer || item.answer;
        item.hasCode = /```/.test(item.answer || '');
        item.status = 'completed';
        const elem = document.getElementById(`answer-content-${item.id}`);
        if (elem) {
          elem.innerHTML = formatAnswerContent(item.answer, 'completed');
        }
        const qElem = document.getElementById(`question-text-${item.id}`);
        if (qElem) {
          qElem.textContent = extractQuestionTitle(item.question, item.answer);
        }
        const badgeElem = document.getElementById(`status-badge-${item.id}`);
        if (badgeElem) {
          badgeElem.className = 'card-status-badge completed';
          badgeElem.textContent = '✓ Solution Ready';
        }
        const card = document.getElementById(`qa-card-${item.id}`);
        if (card) {
          card.classList.remove('live-active');
          card.classList.add('completed');
        }
        updateCounts();
        applyFilters();
      }
    });

    window.qaApi.onQaHistoryCleared(() => {
      allItems = [];
      renderAllItems();
    });
  }
}

function setupStealthWindowDrag() {
  const titlebar = document.querySelector('.qa-titlebar');
  if (!titlebar || !window.qaApi?.moveWindowBy) return;

  let isDragging = false;
  let lastScreenX = 0;
  let lastScreenY = 0;
  let accumulatedDeltaX = 0;
  let accumulatedDeltaY = 0;
  let moveRaf = null;

  titlebar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, select, textarea, a, [role="button"]')) return;

    e.preventDefault();
    isDragging = true;
    lastScreenX = e.screenX;
    lastScreenY = e.screenY;
    accumulatedDeltaX = 0;
    accumulatedDeltaY = 0;
    titlebar.setPointerCapture?.(e.pointerId);

    const onPointerMove = (moveEvt) => {
      if (!isDragging) return;
      const dx = moveEvt.screenX - lastScreenX;
      const dy = moveEvt.screenY - lastScreenY;
      lastScreenX = moveEvt.screenX;
      lastScreenY = moveEvt.screenY;

      accumulatedDeltaX += dx;
      accumulatedDeltaY += dy;

      if (!moveRaf) {
        moveRaf = window.requestAnimationFrame(() => {
          moveRaf = null;
          if (accumulatedDeltaX !== 0 || accumulatedDeltaY !== 0) {
            const sendX = accumulatedDeltaX;
            const sendY = accumulatedDeltaY;
            accumulatedDeltaX = 0;
            accumulatedDeltaY = 0;
            window.qaApi.moveWindowBy(sendX, sendY);
          }
        });
      }
    };

    const onPointerUp = (upEvt) => {
      isDragging = false;
      titlebar.releasePointerCapture?.(upEvt.pointerId);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      if (moveRaf) {
        window.cancelAnimationFrame(moveRaf);
        moveRaf = null;
      }
      if (accumulatedDeltaX !== 0 || accumulatedDeltaY !== 0) {
        window.qaApi.moveWindowBy(accumulatedDeltaX, accumulatedDeltaY);
        accumulatedDeltaX = 0;
        accumulatedDeltaY = 0;
      }
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  });
}

function setupStealthWindowResize() {
  const handles = document.querySelectorAll('.window-resize-handle');
  if (!handles.length || !window.qaApi?.resizeWindowBy) return;

  handles.forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const direction = handle.dataset.resizeHandle || 'se';
      const pointerId = e.pointerId;
      let lastScreenX = e.screenX;
      let lastScreenY = e.screenY;
      let isResizing = true;
      let accumulatedDx = 0;
      let accumulatedDy = 0;
      let resizeRaf = null;

      document.body.classList.add('window-resizing');
      handle.setPointerCapture?.(pointerId);

      const onPointerMove = (moveEvt) => {
        if (!isResizing) return;
        const dx = moveEvt.screenX - lastScreenX;
        const dy = moveEvt.screenY - lastScreenY;
        lastScreenX = moveEvt.screenX;
        lastScreenY = moveEvt.screenY;

        accumulatedDx += dx;
        accumulatedDy += dy;

        if (!resizeRaf) {
          resizeRaf = window.requestAnimationFrame(() => {
            resizeRaf = null;
            if (accumulatedDx !== 0 || accumulatedDy !== 0) {
              const sendDx = accumulatedDx;
              const sendDy = accumulatedDy;
              accumulatedDx = 0;
              accumulatedDy = 0;
              window.qaApi.resizeWindowBy({
                direction,
                deltaX: sendDx,
                deltaY: sendDy,
                minWidth: 420,
                minHeight: 320
              });
            }
          });
        }
      };

      const onPointerUp = (upEvt) => {
        isResizing = false;
        document.body.classList.remove('window-resizing');
        handle.releasePointerCapture?.(upEvt.pointerId);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        if (resizeRaf) {
          window.cancelAnimationFrame(resizeRaf);
          resizeRaf = null;
        }
        if (accumulatedDx !== 0 || accumulatedDy !== 0) {
          window.qaApi.resizeWindowBy({
            direction,
            deltaX: accumulatedDx,
            deltaY: accumulatedDy,
            minWidth: 420,
            minHeight: 320
          });
          accumulatedDx = 0;
          accumulatedDy = 0;
        }
      };

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
    });
  });
}

async function init() {
  setupListeners();
  setupStealthWindowDrag();
  setupStealthWindowResize();
  if (window.qaApi?.onClickThroughModeChanged) {
    window.qaApi.onClickThroughModeChanged((enabled) => {
      isGhostMode = Boolean(enabled);
      updateGhostBtnState();
    });
  }
  if (window.qaApi?.getClickThroughStatus) {
    window.qaApi.getClickThroughStatus().then((res) => {
      if (res && typeof res.clickThroughEnabled === 'boolean') {
        isGhostMode = res.clickThroughEnabled;
        updateGhostBtnState();
      }
    }).catch(() => {});
  }
  if (window.qaApi?.getQaHistory) {
    try {
      const history = await window.qaApi.getQaHistory();
      if (Array.isArray(history)) {
        allItems = history;
        renderAllItems();
      }
    } catch (err) {
      console.error('Failed to load initial Q&A history:', err);
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
