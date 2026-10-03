// HTTP CORS and WebSocket upgrades use the same explicit origin allowlist. The server hosts no
// UI, so every legitimate caller is a listed client origin; requests without Origin are refused.
// Origin checking is browser policy, not authentication: non-browser callers can forge it.
export function allowsOrigin(origin: string | undefined, configured = ''): origin is string {
  if (!origin) return false;
  return configured.split(',').some((entry) => {
    const candidate = entry.trim();
    try {
      const url = new URL(candidate);
      return (
        url.origin === candidate &&
        candidate === origin &&
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      );
    } catch {
      return false;
    }
  });
}
