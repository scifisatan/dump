import { Hono } from 'hono';
import type { Env } from './env';
import { pingSchema } from '../shared/api';
export { DumpDO } from './dump-do';

const app = new Hono<{ Bindings: Env }>();

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
    return c.json(pingSchema.parse({ ok: true, mode }));
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
