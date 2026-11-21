export function createWindowAdjustmentManager({
    windowResizeHandles,
    dragHandle,
    chatContainer,
    minWindowWidth,
    minWindowHeight,
    onViewportResize
}) {
    let activeWindowResize = null;
    let pendingWindowBounds = null;
    let windowResizeFrame = null;

    function setupWindowAdjustments() {
        setupStealthWindowDrag();
        setupWindowResizeHandles();
        enforceChatFillLayout();
        window.addEventListener('resize', () => {
            enforceChatFillLayout();
            onViewportResize?.();
        });
    }

    function setupStealthWindowDrag() {
        const handle = dragHandle || document.querySelector('.drag-handle');
        if (!handle || !window.electronAPI?.moveWindowBy) {
            return;
        }

        let isDragging = false;
        let lastScreenX = 0;
        let lastScreenY = 0;
        let accumulatedDeltaX = 0;
        let accumulatedDeltaY = 0;
        let moveRaf = null;

        handle.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('button, input, select, textarea, a, [role="button"]')) return;

            e.preventDefault();
            isDragging = true;
            lastScreenX = e.screenX;
            lastScreenY = e.screenY;
            accumulatedDeltaX = 0;
            accumulatedDeltaY = 0;
            handle.setPointerCapture?.(e.pointerId);

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
                            window.electronAPI.moveWindowBy(sendX, sendY);
                        }
                    });
                }
            };

            const onPointerUp = (upEvt) => {
                isDragging = false;
                handle.releasePointerCapture?.(upEvt.pointerId);
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', onPointerUp);
                document.removeEventListener('pointercancel', onPointerUp);
                if (moveRaf) {
                    window.cancelAnimationFrame(moveRaf);
                    moveRaf = null;
                }
                if (accumulatedDeltaX !== 0 || accumulatedDeltaY !== 0) {
                    window.electronAPI.moveWindowBy(accumulatedDeltaX, accumulatedDeltaY);
                    accumulatedDeltaX = 0;
                    accumulatedDeltaY = 0;
                }
            };

            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
            document.addEventListener('pointercancel', onPointerUp);
        });
    }

    function enforceChatFillLayout() {
        if (!chatContainer) {
            return;
        }

        // Ensure stale manual-resize inline styles never pin chat height.
        chatContainer.style.removeProperty('height');
    }

    function setupWindowResizeHandles() {
        if (!window.electronAPI || !windowResizeHandles.length) {
            return;
        }

        windowResizeHandles.forEach((handle) => {
            handle.addEventListener('pointerdown', startWindowResize);
        });
    }

    async function startWindowResize(event) {
        if (!window.electronAPI?.getWindowBounds || !window.electronAPI?.setWindowBounds) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const handleElement = event.currentTarget;
        if (!handleElement) {
            return;
        }

        const direction = handleElement.dataset.resizeHandle;
        const pointerId = event.pointerId;
        const startScreenX = event.screenX;
        const startScreenY = event.screenY;
        const startBounds = await window.electronAPI.getWindowBounds();
        if (!startBounds || startBounds.error) {
            console.error('Failed to get initial window bounds:', startBounds?.error);
            return;
        }

        activeWindowResize = {
            direction,
            pointerId,
            startScreenX,
            startScreenY,
            startBounds,
            handleElement
        };

        document.body.classList.add('window-resizing');
        handleElement.setPointerCapture?.(pointerId);

        document.addEventListener('pointermove', onWindowResizeMove);
        document.addEventListener('pointerup', stopWindowResize);
        document.addEventListener('pointercancel', stopWindowResize);
    }

    function onWindowResizeMove(event) {
        if (!activeWindowResize || event.pointerId !== activeWindowResize.pointerId) {
            return;
        }

        event.preventDefault();

        const deltaX = event.screenX - activeWindowResize.startScreenX;
        const deltaY = event.screenY - activeWindowResize.startScreenY;
        const nextBounds = calculateWindowResizeBounds(
            activeWindowResize.startBounds,
            activeWindowResize.direction,
            deltaX,
            deltaY
        );

        scheduleWindowResize(nextBounds);
    }

    function calculateWindowResizeBounds(startBounds, direction, deltaX, deltaY) {
        let { x, y, width, height } = startBounds;

        if (direction.includes('e')) {
            width = Math.max(minWindowWidth, startBounds.width + deltaX);
        }

        if (direction.includes('s')) {
            height = Math.max(minWindowHeight, startBounds.height + deltaY);
        }

        if (direction.includes('w')) {
            const nextWidth = Math.max(minWindowWidth, startBounds.width - deltaX);
            x = startBounds.x + (startBounds.width - nextWidth);
            width = nextWidth;
        }

        if (direction.includes('n')) {
            const nextHeight = Math.max(minWindowHeight, startBounds.height - deltaY);
            y = startBounds.y + (startBounds.height - nextHeight);
            height = nextHeight;
        }

        return {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height)
        };
    }

    function scheduleWindowResize(bounds) {
        pendingWindowBounds = bounds;
        if (windowResizeFrame) {
            return;
        }

        windowResizeFrame = window.requestAnimationFrame(async () => {
            windowResizeFrame = null;
            const nextBounds = pendingWindowBounds;
            pendingWindowBounds = null;

            if (!nextBounds) {
                return;
            }

            const result = await window.electronAPI.setWindowBounds(nextBounds);
            if (result && result.error) {
                console.error('Failed to set window bounds:', result.error);
            }
        });
    }

    function stopWindowResize(event) {
        if (!activeWindowResize) {
            return;
        }

        if (event.pointerId && event.pointerId !== activeWindowResize.pointerId) {
            return;
        }

        activeWindowResize.handleElement?.releasePointerCapture?.(activeWindowResize.pointerId);
        activeWindowResize = null;
        pendingWindowBounds = null;

        if (windowResizeFrame) {
            window.cancelAnimationFrame(windowResizeFrame);
            windowResizeFrame = null;
        }

        document.body.classList.remove('window-resizing');
        document.removeEventListener('pointermove', onWindowResizeMove);
        document.removeEventListener('pointerup', stopWindowResize);
        document.removeEventListener('pointercancel', stopWindowResize);
    }

    return {
        setupWindowAdjustments
    };
}
