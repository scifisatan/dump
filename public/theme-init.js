// Applies the saved theme before first paint, so the loading screen and the app never flash the
// wrong colors. next-themes (storageKey `dump-theme`, default light) takes over once React runs.
// An external file because the Content-Security-Policy allows no inline scripts.
try {
  const saved = localStorage.getItem('dump-theme') || 'light';
  const dark =
    saved === 'dark' ||
    (saved === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.add(dark ? 'dark' : 'light');
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
} catch {
  // Storage can be unavailable; the light default is correct then.
}
