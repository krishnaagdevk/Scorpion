'use strict';

/**
 * Stealth Virtual Pointer Controller
 *
 * Completely suppresses the OS hardware mouse pointer over protected windows
 * so screen sharing tools (Zoom, Microsoft Teams, Google Meet, Discord, OBS)
 * capture NO mouse movement.
 *
 * Simultaneously renders a silky, high-FPS in-DOM virtual cursor that is
 * 100% visible to the user on their screen, but 100% invisible on screen share
 * because the window uses SetWindowDisplayAffinity (WDA_EXCLUDEFROMCAPTURE).
 */

const CURSOR_ID = 'stealth-virtual-cursor';

function createCursorSvg() {
  return `
    <svg class="stealth-cursor-svg" width="22" height="26" viewBox="0 0 22 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 2L8.8 21.2L12.4 14.2L19.8 11.2L2 2Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.8" stroke-linejoin="round"/>
      <circle class="stealth-cursor-accent" cx="3" cy="3" r="1.5" fill="#0EA5E9" />
    </svg>
  `;
}

function initStealthCursor({
  onModeChange = null,
  getInitialStatus = null,
  toggleApi = null,
  onPointerVisibilityChanged = null
} = {}) {
  let currentMode = 'stealth'; // 'stealth' | 'hidden' | 'system'
  let cursorEl = document.getElementById(CURSOR_ID);

  if (!cursorEl) {
    cursorEl = document.createElement('div');
    cursorEl.id = CURSOR_ID;
    cursorEl.className = 'stealth-virtual-cursor';
    cursorEl.setAttribute('aria-hidden', 'true');
    cursorEl.innerHTML = createCursorSvg();
    document.body.appendChild(cursorEl);
  }

  let targetX = -100;
  let targetY = -100;
  let isRafScheduled = false;
  let isInsideWindow = false;

  function renderCursorPosition() {
    if (cursorEl) {
      cursorEl.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
    }
    isRafScheduled = false;
  }

  function schedulePositionUpdate(x, y) {
    targetX = x;
    targetY = y;
    if (!isRafScheduled) {
      isRafScheduled = true;
      requestAnimationFrame(renderCursorPosition);
    }
  }

  function checkInteractiveElement(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest(
      'button, a, input, select, textarea, [role="button"], [data-tooltip], ' +
      '.action-btn, .titlebar-btn, .copy-btn, .action-pill-btn, .filter-pill, ' +
      '.close-btn, .pin-app-btn, .transcription-btn, .mode-pill, .preset-button'
    );
  }

  function applyMode(mode) {
    currentMode = mode || 'stealth';
    const docEl = document.documentElement;

    if (currentMode === 'stealth') {
      docEl.classList.add('stealth-cursor-mode');
      cursorEl.classList.remove('cursor-hidden');
      if (isInsideWindow) {
        cursorEl.classList.add('cursor-visible');
      }
    } else if (currentMode === 'hidden') {
      docEl.classList.add('stealth-cursor-mode');
      cursorEl.classList.add('cursor-hidden');
      cursorEl.classList.remove('cursor-visible');
    } else if (currentMode === 'system') {
      docEl.classList.remove('stealth-cursor-mode');
      cursorEl.classList.add('cursor-hidden');
      cursorEl.classList.remove('cursor-visible');
    }

    if (typeof onModeChange === 'function') {
      onModeChange(currentMode);
    }
  }

  function handlePointerMove(e) {
    isInsideWindow = true;
    schedulePositionUpdate(e.clientX, e.clientY);

    if (currentMode === 'stealth') {
      cursorEl.classList.add('cursor-visible');
      if (checkInteractiveElement(e.target)) {
        cursorEl.classList.add('cursor-pointer');
      } else {
        cursorEl.classList.remove('cursor-pointer');
      }
    }
  }

  function handlePointerDown() {
    if (cursorEl) {
      cursorEl.classList.add('cursor-clicking');
    }
  }

  function handlePointerUp() {
    if (cursorEl) {
      cursorEl.classList.remove('cursor-clicking');
    }
  }

  function handlePointerEnter(e) {
    isInsideWindow = true;
    schedulePositionUpdate(e.clientX, e.clientY);
    if (currentMode === 'stealth') {
      cursorEl.classList.add('cursor-visible');
    }
  }

  function handlePointerLeave() {
    isInsideWindow = false;
    if (cursorEl) {
      cursorEl.classList.remove('cursor-visible');
      cursorEl.classList.remove('cursor-clicking');
    }
  }

  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  window.addEventListener('pointerdown', handlePointerDown, { passive: true });
  window.addEventListener('pointerup', handlePointerUp, { passive: true });
  window.addEventListener('pointerenter', handlePointerEnter, { passive: true });
  window.addEventListener('pointerleave', handlePointerLeave, { passive: true });

  // Initial default mode
  applyMode('stealth');

  // Subscribe to IPC mode changes
  let unsubscribe = null;
  if (typeof onPointerVisibilityChanged === 'function') {
    unsubscribe = onPointerVisibilityChanged((data) => {
      const nextMode = typeof data === 'string' ? data : data?.mode;
      if (nextMode) {
        applyMode(nextMode);
      }
    });
  }

  // Query initial status from main process if available
  if (typeof getInitialStatus === 'function') {
    Promise.resolve(getInitialStatus())
      .then((res) => {
        if (res?.mode) {
          applyMode(res.mode);
        }
      })
      .catch(() => {});
  }

  async function toggle() {
    if (typeof toggleApi === 'function') {
      try {
        const res = await toggleApi();
        if (res?.mode) {
          applyMode(res.mode);
          return res.mode;
        }
      } catch (_) {}
    }
    const next = currentMode === 'stealth' ? 'hidden' : 'stealth';
    applyMode(next);
    return next;
  }

  function destroy() {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerdown', handlePointerDown);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointerenter', handlePointerEnter);
    window.removeEventListener('pointerleave', handlePointerLeave);
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
    if (cursorEl && cursorEl.parentNode) {
      cursorEl.parentNode.removeChild(cursorEl);
    }
    document.documentElement.classList.remove('stealth-cursor-mode');
  }

  return {
    getMode: () => currentMode,
    setMode: applyMode,
    toggle,
    destroy
  };
}

if (typeof window !== 'undefined') {
  window.StealthCursor = { initStealthCursor };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initStealthCursor };
}
