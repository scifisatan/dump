import { Hono } from 'hono';
import { jevKey, type Env } from './env';
import { pingSchema } from '../shared/api';
import { classifyRequestSchema, jevRequest, readJevResponse } from '../shared/classify';
export { DumpDO } from './dump-do';

const app = new Hono<{ Bindings: Env }>();

// The app is public, so this route spends the Jev key for anyone who calls it. A per-isolate
// budget is a coarse brake, not a quota; removing JEV_API_KEY turns the route off.
const CLASSIFY_PER_MINUTE = 60;
let classifyWindow = { start: 0, count: 0 };
function classifyAllowed(now = Date.now()) {
  if (now - classifyWindow.start >= 60_000) classifyWindow = { start: now, count: 0 };
  return ++classifyWindow.count <= CLASSIFY_PER_MINUTE;
}

app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/api/')) {
    c.header('Cache-Control', 'no-store');
    const origin = c.req.header('Origin');
    const expected = new URL(c.req.url).origin;
    if (origin && origin !== expected) return c.json({ error: 'Origin rejected.' }, 403);
    if (c.req.method === 'POST' && !origin) return c.json({ error: 'Origin required.' }, 403);
  }
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Frame-Options', 'DENY');
});

const routes = app
  .get('/api/ping', (c) => {
    const hostname = new URL(c.req.url).hostname;
    const mode = ['localhost', '127.0.0.1', '[::1]'].includes(hostname) ? 'local' : 'cloud';
    const classify = !!jevKey(c.env);
    return c.json(pingSchema.parse({ ok: true, mode, classify }));
  })
  // Stateless proxy to Jev: the browser cannot call it directly (CORS) or hold the key.
  .post('/api/classify', async (c) => {
    const key = jevKey(c.env);
    if (!key) return c.json({ error: 'Classification is off.' }, 503);
    if (!classifyAllowed()) return c.json({ error: 'Too many requests.' }, 429);
    const parsed = classifyRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid request.' }, 400);
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jevRequest(parsed.data)),
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) {
      console.error('Jev request failed:', response.status);
      return c.json({ error: 'Classification failed.' }, 502);
    }
    return c.json(readJevResponse(await response.json(), parsed.data));
  })
  // TinyBase WebSocket sync. Browsers send Origin on upgrades, so the check above applies.
  .get('/api/sync', async (c) => {
    if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket')
      return c.text('WebSocket required', 426);
    const stub = c.env.DUMP.get(c.env.DUMP.idFromName('me'));
    return stub.fetch(new Request('https://dump.internal/me', c.req.raw));
  });

app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));
app.onError((error, c) => {
  console.error('Request failed:', error.name);
  return c.json({ error: 'Unable to complete the request. Your local data is safe.' }, 500);
});

export type AppType = typeof routes;
export default app;
