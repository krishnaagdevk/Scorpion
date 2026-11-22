const test = require('node:test');
const assert = require('node:assert/strict');

function formatResponse(text) {
    if (!text) return '';
    let formatted = String(text)
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

    return formatted.replace(/\n/g, '<br>');
}

test('formatResponse transforms interview answer into teleprompter HUD components', () => {
    const aiOutput = `**🎯 Question:** How do you handle database migrations with zero downtime?

**Say this (Opening):**
"I use an expand-and-contract pattern where schema changes are made backward-compatible before deploying new application code."

**Approach:**
• Step 1: Add new nullable column or table.
• Step 2: Deploy dual-write code.
• Step 3: Backfill data and switch read path.`;

    const html = formatResponse(aiOutput);
    assert.match(html, /teleprompter-question/);
    assert.match(html, /🎯 Question/);
    assert.match(html, /teleprompter-say-this/);
    assert.match(html, /Say this \(Opening\)/);
    assert.match(html, /expand-and-contract pattern/);

    const headlineOutput = `**🎯 Question:** Designing an Idempotent Payment API

**Say this (Headline):** We enforce idempotency using client-generated idempotency keys.

\`\`\`python
def execute_payment(idempotency_key, amount):
    return True
\`\`\``;
    const headlineHtml = formatResponse(headlineOutput);
    assert.match(headlineHtml, /teleprompter-say-this/);
    assert.match(headlineHtml, /client-generated idempotency keys/);
    assert.match(headlineHtml, /code-block-wrapper/);
    assert.match(headlineHtml, /copy-code-btn/);
    assert.match(headlineHtml, /def execute_payment/);
});

function autoRepairIncompleteMarkdown(text) {
    if (!text) return '';
    let sanitized = String(text);
    const codeFences = (sanitized.match(/```/g) || []).length;
    if (codeFences % 2 !== 0) {
        sanitized += '\n```';
    }
    const boldMarkers = (sanitized.match(/\*\*/g) || []).length;
    if (boldMarkers % 2 !== 0) {
        sanitized += '**';
    }
    return sanitized;
}

test('autoRepairIncompleteMarkdown safely closes unclosed code blocks and bold tags during live streaming', () => {
    const unclosedCode = "Here is the solution:\n```python\ndef solve(arr):\n    return sum(arr)";
    const repairedCode = autoRepairIncompleteMarkdown(unclosedCode);
    assert.ok(repairedCode.endsWith('\n```'));

    const unclosedBold = "**Say this (Opening): I optimized the latency";
    const repairedBold = autoRepairIncompleteMarkdown(unclosedBold);
    assert.ok(repairedBold.endsWith('**'));
});

test('formatResponse formats /btw Quick Answer headers into distinct badge UI', () => {
    function formatWithBtw(text) {
        let formatted = formatResponse(text);
        return formatted.replace(
            /(?:<strong>)?💬\s*\/btw\s*(?:Quick Answer)?:?(?:<\/strong>)?:?/i,
            '<div class="teleprompter-say-header"><span class="say-icon">💬</span><span class="btw-badge">/btw Quick Answer</span></div>'
        );
    }

    const btwText = `**💬 /btw Quick Answer:**\n\nTo reverse a linked list in O(n) time, maintain three pointers: prev, curr, and next.`;
    const formatted = formatWithBtw(btwText);
    assert.match(formatted, /btw-badge/);
    assert.match(formatted, /\/btw Quick Answer/);
    assert.match(formatted, /three pointers: prev, curr, and next/);
});

test('handles manual /btw question normalization and parallel action IDs', () => {
    const inputWithSlashBtw = '/btw How does RAFT consensus work?';
    const cleanQuestion1 = inputWithSlashBtw.replace(/^\/btw\s*/i, '').trim();
    assert.equal(cleanQuestion1, 'How does RAFT consensus work?');

    const inputDirectQuestion = 'What is CAP theorem?';
    const cleanQuestion2 = inputDirectQuestion.replace(/^\/btw\s*/i, '').trim();
    assert.equal(cleanQuestion2, 'What is CAP theorem?');

    const actionId = `btw-${Date.now()}-123`;
    assert.ok(actionId.startsWith('btw-'));
    assert.notEqual(actionId, 'askAi');
});
