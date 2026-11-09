import { useSyncExternalStore } from 'react';

// Light, Dark or System, chosen in Settings and kept per device. Astryx's <Theme> takes the
// resolved mode; `public/theme-init.js` applies the same choice before first paint, and the
// `light`/`dark` class on <html> keeps the loading screen and Tailwind's `dark:` variant in step.
export type ColorMode = 'light' | 'dark' | 'system';

const KEY = 'dump-theme';
const system = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function stored(): ColorMode {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'dark' || value === 'system' ? value : 'light';
  } catch {
    return 'light';
  }
}

let mode = stored();

function resolve(value: ColorMode): 'light' | 'dark' {
  return value === 'system' ? (system.matches ? 'dark' : 'light') : value;
}

function apply() {
  const resolved = resolve(mode);
  const root = document.documentElement;
  // A theme switch repaints everything at once rather than easing every transition.
  const pause = document.createElement('style');
  pause.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.append(pause);
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
  void getComputedStyle(root).colorScheme;
  requestAnimationFrame(() => pause.remove());
  listeners.forEach((listener) => listener());
}

export function setColorMode(next: ColorMode) {
  mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Without storage the choice lasts until the page reloads.
  }
  apply();
}

system.addEventListener('change', () => {
  if (mode === 'system') apply();
});
// Another tab changed the choice.
window.addEventListener('storage', (event) => {
  if (event.key !== KEY) return;
  mode = stored();
  apply();
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useColorMode() {
  const current = useSyncExternalStore(subscribe, () => mode);
  const resolved = useSyncExternalStore(subscribe, () => resolve(mode));
  return { mode: current, resolved, setMode: setColorMode };
}
