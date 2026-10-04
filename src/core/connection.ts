import { z } from 'zod';
import { instanceIdSchema, pingSchema, syncTicketSchema } from '../shared/api';

export class ConnectionError extends Error {}
// The server refused the owner key: it is wrong, missing, or was rotated.
export class Unauthorized extends ConnectionError {}

// A server lives at an origin. Reject paths and credentials rather than silently dropping them.
export function serverUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ConnectionError('Enter a full server address, such as https://dump.example.com.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    throw new ConnectionError('Use HTTPS, or HTTP on localhost for development.');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new ConnectionError('Use the server address without a path, query, or credentials.');
  return url.origin;
}

export const serverSchema = z.object({
  baseUrl: z.string().transform(serverUrl),
  instanceId: instanceIdSchema,
});
export type ServerLocation = z.infer<typeof serverSchema>;
// One notebook: synced with a server, or (server: null) kept only on this device.
export const profileSchema = z.object({
  id: z.uuid(),
  server: serverSchema.nullable(),
});
export type ServerProfile = z.infer<typeof profileSchema>;

export function readServerInfo(value: unknown) {
  const result = pingSchema.safeParse(value);
  if (!result.success)
    throw new ConnectionError(
      'This address is not a compatible Dump server. Update the server and try again.',
    );
  return result.data;
}

// What the owner sees when a server cannot be checked or connected, on every client. A browser
// cannot read a refused origin (the 403 carries no CORS headers), so it fails like an unreachable
// server and that message names both causes.
export function explainConnectionError(cause: unknown, fallback: string) {
  if (cause instanceof TypeError)
    return 'Could not reach this server. Check the address, that it is online, and that its ALLOWED_CLIENT_ORIGINS lists this app.';
  return cause instanceof Error ? cause.message : fallback;
}

// Only native clients read a refused origin's 403; see explainConnectionError for browsers.
const failed = (status: number) =>
  new ConnectionError(
    status === 403
      ? 'This server does not allow the web app address this app presents. Add it to ALLOWED_CLIENT_ORIGINS on the server, or change it in Settings.'
      : `Server check failed (${status}).`,
  );

const withTimeout = (signal?: AbortSignal) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000);

export async function inspectServer(baseUrl: string, signal?: AbortSignal) {
  const response = await fetch(`${serverUrl(baseUrl)}/api/ping`, {
    signal: withTimeout(signal),
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
  });
  if (!response.ok) throw failed(response.status);
  return readServerInfo(await response.json());
}

export const ownerKeyHeaders = (key: string) => ({ Authorization: `Bearer ${key}` });

// Checks the owner key and buys a one-minute ticket for the WebSocket, which cannot carry
// headers. Connecting uses this call to verify a key before saving it.
export async function requestTicket(baseUrl: string, key: string, signal?: AbortSignal) {
  const response = await fetch(`${serverUrl(baseUrl)}/api/sync-ticket`, {
    method: 'POST',
    headers: ownerKeyHeaders(key),
    signal: withTimeout(signal),
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
  });
  if (response.status === 401) throw new Unauthorized('That owner key doesn’t match this server.');
  if (response.status === 503)
    throw new ConnectionError('This server has no owner key yet. Set OWNER_KEY and redeploy it.');
  if (!response.ok) throw failed(response.status);
  const result = syncTicketSchema.safeParse(await response.json());
  if (!result.success) throw new ConnectionError('This server sent an unexpected response.');
  return result.data.ticket;
}

export function syncUrl(baseUrl: string, instanceId: string, ticket: string) {
  const url = new URL('/api/sync', serverUrl(baseUrl));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('instance', instanceId);
  url.searchParams.set('ticket', ticket);
  return url.href;
}

export const databaseName = (profile: ServerProfile) => `dump-v1-${profile.id}`;
export const channelName = (profile: ServerProfile) => `dump-tabs-${profile.id}`;
