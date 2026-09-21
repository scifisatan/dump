import { useEffect } from 'react';

// Keyboards taller than this count as open; smaller differences are browser toolbars.
const KEYBOARD_MIN_HEIGHT = 120;
// Where the last measured keyboard height is remembered between visits.
const KEYBOARD_HEIGHT_KEY = 'dump-keyboard-height';
// After a predicted change, resync with the real viewport in case no keyboard moved.
const SETTLE_MS = 600;

function editable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')
  );
}

function readStoredHeight() {
  try {
    const height = Number(localStorage.getItem(KEYBOARD_HEIGHT_KEY));
    return height > KEYBOARD_MIN_HEIGHT ? height : 0;
  } catch {
    return 0;
  }
}

function storeHeight(height: number) {
  try {
    localStorage.setItem(KEYBOARD_HEIGHT_KEY, String(Math.round(height)));
  } catch {
    // Without storage the next open simply waits for the real measurement.
  }
}

/**
 * Tracks the visible part of the page so a fixed layout can sit above the on-screen keyboard.
 *
 * iOS overlays the keyboard without resizing the layout viewport (and ignores
 * `interactive-widget`), so `dvh` stays full height. The visual viewport is the only signal:
 * this writes its height and offset to `--vv-height` and `--vv-top` on the root element, and
 * sets `data-keyboard` while the keyboard is open. Pinch zoom leaves the variables alone.
 *
 * The visual viewport only reports the keyboard after its animation has started, so on touch
 * devices focus and blur predict the change from the last measured keyboard height; the layout
 * animates toward it with the keyboard, and the real measurement corrects any difference.
 */
export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const touch = window.matchMedia('(pointer: coarse)').matches;
    let keyboardHeight = readStoredHeight();
    let frame = 0;
    let settle = 0;
    const setHeight = (height: number, keyboard: boolean) => {
      root.style.setProperty('--vv-height', `${height}px`);
      root.toggleAttribute('data-keyboard', keyboard);
    };
    const update = () => {
      frame = 0;
      if (viewport.scale > 1.01) return;
      const covered = window.innerHeight - viewport.height;
      const keyboard = covered > KEYBOARD_MIN_HEIGHT;
      if (keyboard && Math.abs(covered - keyboardHeight) > 1) {
        keyboardHeight = covered;
        storeHeight(covered);
      }
      setHeight(viewport.height, keyboard);
      root.style.setProperty('--vv-top', `${viewport.offsetTop}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const predict = (open: boolean) => {
      if (!touch || viewport.scale > 1.01) return;
      if (open && keyboardHeight) setHeight(window.innerHeight - keyboardHeight, true);
      if (!open) setHeight(window.innerHeight, false);
      clearTimeout(settle);
      settle = window.setTimeout(schedule, SETTLE_MS);
    };
    const focusIn = (event: FocusEvent) => {
      if (editable(event.target)) predict(true);
    };
    const focusOut = (event: FocusEvent) => {
      // Moving between fields keeps the keyboard up.
      if (editable(event.target) && !editable(event.relatedTarget)) predict(false);
    };
    update();
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      root.style.removeProperty('--vv-height');
      root.style.removeProperty('--vv-top');
      root.removeAttribute('data-keyboard');
    };
  }, []);
}
