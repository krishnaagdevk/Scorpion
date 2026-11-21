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
