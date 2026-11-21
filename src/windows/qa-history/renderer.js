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
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');
const viewModeBtn = document.getElementById('view-mode-btn');
let isGhostMode = false;
let isFlashcardMode = false;

function updateGhostBtnState() {
  if (!ghostBtn) return;
  ghostBtn.classList.toggle('active', isGhostMode);
  ghostBtn.setAttribute('aria-pressed', isGhostMode ? 'true' : 'false');
  ghostBtn.setAttribute('data-tooltip', isGhostMode
    ? 'Ghost Mode Active (Alt+Shift+P): Clicks pass directly to VS Code / Notepad'
    : 'Ghost Mode (Alt+Shift+P): Click & type directly in VS Code / Notepad through this window');
  ghostBtn.removeAttribute('title');
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

function calculateConfidence(item) {
  if (item.status === 'evaluating' || !item.answer) {
    return { label: '⚡ Streaming Live', class: 'evaluating' };
  }
  const ans = String(item.answer || '');
  if (ans.length > 200 && (ans.includes('Say this') || ans.includes('Complexity:') || ans.includes('```'))) {
    return { label: '🟢 98% High Confidence', class: 'high' };
  }
  if (ans.length > 80) {
    return { label: '🟡 90% Grounded', class: 'medium' };
  }
  return { label: '✓ Ready', class: 'completed' };
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

  const qType = detectQuestionType(item.question, item.answer);
  const confidence = calculateConfidence(item);

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
        <span class="card-type-badge ${qType.pillClass}">${qType.label}</span>
        <span class="card-confidence-badge ${confidence.class}">${confidence.label}</span>
        <span class="card-time">${timeStr}</span>
      </div>
      <div class="card-actions">
        <button class="action-pill-btn copy-answer-btn" data-id="${item.id}" data-tooltip="Copy complete answer">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          <span>Copy</span>
        </button>
        <button class="action-pill-btn delete-card-btn" data-id="${item.id}" data-tooltip="Remove question (can recall anytime)">
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
    redoBtn.setAttribute('data-tooltip', `Recall Removed Questions (${deletedStack.length} in buffer)`);
    redoBtn.removeAttribute('title');
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

function exportSessionAsMarkdown() {
  if (!allItems || allItems.length === 0) {
    showRecallToast('No Q&A pairs to export yet');
    return;
  }

  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timeStr = new Date().toLocaleTimeString('en-US');

  let md = `# Open-Cluely Interview Q&A Session Report\n\n`;
  md += `**Date:** ${dateStr} at ${timeStr}  \n`;
  md += `**Total Questions Answered:** ${allItems.length}  \n`;
  md += `**AI Engine:** gemini-3.8-flash-low / Antigravity CLI  \n\n`;
  md += `---\n\n`;

  allItems.forEach((item, idx) => {
    const qTitle = extractQuestionTitle(item.question, item.answer);
    const qType = detectQuestionType(item.question, item.answer);
    const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '';

    md += `## Question ${idx + 1}: ${qTitle}\n\n`;
    md += `- **Type:** ${qType.label}\n`;
    if (time) md += `- **Time:** ${time}\n`;
    md += `- **Source:** ${item.source === 'screen' ? 'Screen OCR / Problem Statement' : 'Interviewer Audio'}\n\n`;

    if (item.question && item.question.trim() !== qTitle.trim()) {
      md += `### Raw Context / Transcript\n> ${item.question.trim().replace(/\n/g, '\n> ')}\n\n`;
    }

    md += `### AI Teleprompter Solution\n\n`;
    md += `${item.answer ? item.answer.trim() : '_No answer recorded_'}\n\n`;
    md += `---\n\n`;
  });

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileName = `interview-session-${new Date().toISOString().slice(0, 10)}.md`;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showRecallToast(`Exported ${allItems.length} Q&A items to ${fileName}`);
}

function toggleViewMode() {
  isFlashcardMode = !isFlashcardMode;
  if (qaFeed) {
    qaFeed.classList.toggle('flashcard-mode', isFlashcardMode);
  }
  if (viewModeBtn) {
    viewModeBtn.classList.toggle('active', isFlashcardMode);
    viewModeBtn.textContent = isFlashcardMode ? '📋 Full Teleprompter' : '⚡ Flashcard Mode';
    viewModeBtn.setAttribute('data-tooltip', isFlashcardMode
      ? 'Currently in Flashcard Mode (High-speed glance reading). Click for Full Teleprompter.'
      : 'Switch to Quick-Glance Flashcard Mode (Prominent spoken answer & top highlights)');
  }
}

// Event Listeners
function setupListeners() {
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      window.qaApi?.closeQaWindow?.();
    });
  }

  if (viewModeBtn) {
    viewModeBtn.addEventListener('click', () => {
      toggleViewMode();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportSessionAsMarkdown();
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
      if (pill.id === 'view-mode-btn') return;
      filterPills.forEach(p => {
        if (p.id !== 'view-mode-btn') p.classList.remove('active');
      });
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

let isWindowDragging = false;
let isWindowResizing = false;

function setupStealthWindowDrag() {
  const container = document.querySelector('.qa-container') || document.querySelector('.qa-titlebar');
  if (!container || !window.qaApi?.moveWindowBy) return;

  let isDragging = false;
  let lastScreenX = 0;
  let lastScreenY = 0;
  let accumulatedDeltaX = 0;
  let accumulatedDeltaY = 0;
  let moveRaf = null;

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (isWindowResizing) return;
    if (e.target.closest('button, input, select, textarea, a, [role="button"], .window-resize-handle, .qa-action-btn, .qa-btn, .action-btn, .filter-chip, .qa-history-item, code, pre')) return;

    e.preventDefault();
    isDragging = true;
    isWindowDragging = true;
    lastScreenX = e.screenX;
    lastScreenY = e.screenY;
    accumulatedDeltaX = 0;
    accumulatedDeltaY = 0;
    container.setPointerCapture?.(e.pointerId);

    const onPointerMove = (moveEvt) => {
      if (!isDragging || isWindowResizing) return;
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
      isWindowDragging = false;
      container.releasePointerCapture?.(upEvt.pointerId);
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
      if (isWindowDragging) return;
      e.preventDefault();
      e.stopPropagation();

      const direction = handle.dataset.resizeHandle || 'se';
      const pointerId = e.pointerId;
      let lastScreenX = e.screenX;
      let lastScreenY = e.screenY;
      let isResizing = true;
      isWindowResizing = true;
      let accumulatedDx = 0;
      let accumulatedDy = 0;
      let resizeRaf = null;

      document.body.classList.add('window-resizing');
      handle.setPointerCapture?.(pointerId);

      const onPointerMove = (moveEvt) => {
        if (!isResizing || isWindowDragging) return;
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
              if (Math.abs(sendDx) >= 2 || Math.abs(sendDy) >= 2) {
                window.qaApi.resizeWindowBy({
                  direction,
                  deltaX: sendDx,
                  deltaY: sendDy,
                  minWidth: 420,
                  minHeight: 280
                });
              }
            }
          });
        }
      };

      const onPointerUp = (upEvt) => {
        isResizing = false;
        isWindowResizing = false;
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

// In-DOM Stealth Tooltips (100% invisible on screen share, replaces native OS tooltips)
function setupStealthTooltips() {
  const tooltipEl = document.getElementById('stealth-tooltip') || (() => {
    const el = document.createElement('div');
    el.id = 'stealth-tooltip';
    el.className = 'stealth-tooltip';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  })();

  function sanitize(root = document) {
    const list = root.querySelectorAll ? root.querySelectorAll('[title]') : [];
    list.forEach((el) => {
      const tip = el.getAttribute('title');
      if (tip) {
        el.setAttribute('data-tooltip', tip);
        el.removeAttribute('title');
      }
    });
    if (root.getAttribute && root.getAttribute('title')) {
      const tip = root.getAttribute('title');
      root.setAttribute('data-tooltip', tip);
      root.removeAttribute('title');
    }
  }

  sanitize();

  try {
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'title' && m.target?.getAttribute?.('title')) {
          const tip = m.target.getAttribute('title');
          m.target.setAttribute('data-tooltip', tip);
          m.target.removeAttribute('title');
        } else if (m.type === 'childList') {
          m.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              sanitize(node);
            }
          });
        }
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['title'], subtree: true, childList: true });
  } catch (_) {}

  let tooltipTimeout = null;
  let currentTarget = null;

  function hideTooltip() {
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
      tooltipTimeout = null;
    }
    tooltipEl.classList.remove('visible');
    tooltipEl.style.display = 'none';
    currentTarget = null;
  }

  function showTooltip(target, text) {
    if (!text) return;
    tooltipEl.textContent = text;
    tooltipEl.style.display = 'block';

    const rect = target.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();

    let top = rect.top - tipRect.height - 6;
    if (top < 6) {
      top = rect.bottom + 6;
    }
    let left = rect.left + (rect.width - tipRect.width) / 2;
    if (left < 6) left = 6;
    if (left + tipRect.width > window.innerWidth - 6) {
      left = window.innerWidth - tipRect.width - 6;
    }

    tooltipEl.style.top = `${Math.round(top)}px`;
    tooltipEl.style.left = `${Math.round(left)}px`;
    tooltipEl.classList.add('visible');
  }

  document.addEventListener('pointerover', (e) => {
    const target = e.target.closest?.('[data-tooltip]');
    if (!target) {
      if (currentTarget && !e.target.closest?.('#stealth-tooltip')) {
        hideTooltip();
      }
      return;
    }
    if (target === currentTarget) return;
    currentTarget = target;
    const text = target.getAttribute('data-tooltip');
    if (!text) {
      hideTooltip();
      return;
    }
    if (tooltipTimeout) clearTimeout(tooltipTimeout);
    tooltipTimeout = setTimeout(() => {
      if (currentTarget === target) {
        showTooltip(target, text);
      }
    }, 180);
  });

  document.addEventListener('pointerout', (e) => {
    const target = e.target.closest?.('[data-tooltip]');
    if (target && target === currentTarget) {
      hideTooltip();
    }
  });

  document.addEventListener('pointerdown', hideTooltip);
  window.addEventListener('blur', hideTooltip);
  window.addEventListener('scroll', hideTooltip, true);
}

async function init() {
  setupStealthTooltips();
  const modelBadgeEl = document.getElementById('model-badge-label');
  if (modelBadgeEl) {
    const activeModel = localStorage.getItem('gemini-model') || localStorage.getItem('antigravity-model') || 'gemini-3.8-flash-low';
    modelBadgeEl.textContent = activeModel;
  }
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
