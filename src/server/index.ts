import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { jevKey, type Env } from './env';
import { pingSchema } from '../shared/api';
import { bearer, createTicket, matchesKey, ownerKey, verifyTicket } from './auth';
import { classifyRequestSchema, jevRequest, readJevResponse } from '../shared/classify';
import { allowsOrigin } from './origins';
export { DumpDO } from './dump-do';

const app = new Hono<{ Bindings: Env }>();

// Only the owner can reach this route, but a per-isolate budget still brakes a runaway client.
// Removing JEV_API_KEY turns the route off.
const CLASSIFY_PER_MINUTE = 60;
let classifyWindow = { start: 0, count: 0 };
function classifyAllowed(now = Date.now()) {
  if (now - classifyWindow.start >= 60_000) classifyWindow = { start: now, count: 0 };
  return ++classifyWindow.count <= CLASSIFY_PER_MINUTE;
}

app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('Vary', 'Origin');
  const origin = c.req.header('Origin');
  if (!allowsOrigin(origin, c.env.ALLOWED_CLIENT_ORIGINS))
    return c.json(
      {
        error: 'Origin rejected. Add this client origin to ALLOWED_CLIENT_ORIGINS on the server.',
      },
      403,
    );
  c.header('Access-Control-Allow-Origin', origin);
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return c.body(null, 204);
  }
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Frame-Options', 'DENY');
});

const UNCONFIGURED = 'This server has no owner key yet. Set OWNER_KEY and redeploy.';

// Everything except discovery needs the owner key: a bearer header on HTTP, and a ticket bought
// with it on the WebSocket upgrade (see auth.ts).
const requireOwner = createMiddleware<{ Bindings: Env; Variables: { ownerKey: string } }>(
  async (c, next) => {
    const key = ownerKey(c.env);
    if (!key) return c.json({ error: UNCONFIGURED }, 503);
    if (!(await matchesKey(bearer(c.req.header('Authorization')), key)))
      return c.json({ error: 'Wrong owner key.' }, 401);
    c.set('ownerKey', key);
    await next();
  },
);

const routes = app
  .get('/api/ping', (c) => {
    const hostname = new URL(c.req.url).hostname;
    const mode = ['localhost', '127.0.0.1', '[::1]'].includes(hostname) ? 'local' : 'cloud';
    const classify = !!jevKey(c.env);
    // The namespace-scoped object ID is stable without waking the sync server before a
    // WebSocket exists (which would leave its initial peer handshake waiting for a timeout).
    const instanceId = c.env.DUMP.idFromName('me').toString();
    return c.json(
      pingSchema.parse({
        ok: true,
        app: 'dump',
        instanceId,
        syncProtocol: 'tinybase-ws',
        auth: ownerKey(c.env) ? 'owner-key' : 'unconfigured',
        mode,
        classify,
      }),
    );
  })
  .post('/api/sync-ticket', requireOwner, async (c) => {
    const ticket = await createTicket(c.get('ownerKey'), c.env.DUMP.idFromName('me').toString());
    return c.json({ ticket });
  })
  // Stateless proxy to Jev: the browser cannot call it directly (CORS) or hold the key.
  .post('/api/classify', requireOwner, async (c) => {
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
    const id = c.env.DUMP.idFromName('me');
    if (c.req.query('instance') !== id.toString())
      return c.text('Notebook identity changed. Reconnect from Settings.', 409);
    const key = ownerKey(c.env);
    if (!key) return c.text(UNCONFIGURED, 503);
    if (!(await verifyTicket(key, id.toString(), c.req.query('ticket') ?? '')))
      return c.text('Sync ticket rejected. Sign in again.', 401);
    // The ticket stops here: the sync server only needs the upgrade itself.
    return c.env.DUMP.get(id).fetch(new Request('https://dump.internal/me', c.req.raw));
  });

app.all('*', (c) => c.json({ error: 'Not found.' }, 404));
app.onError((error, c) => {
  console.error('Request failed:', error.name);
  return c.json({ error: 'Unable to complete the request. Your local data is safe.' }, 500);
});

export type AppType = typeof routes;
export default app;
