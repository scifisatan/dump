import type { Env } from './env';

// The owner key is a server's only credential. It must be long and random
// (`openssl rand -base64 32`); anything shorter counts as not configured, and an unconfigured
// server answers nothing but /api/ping.
export const MIN_OWNER_KEY_LENGTH = 32;
export const TICKET_SECONDS = 60;

export const ownerKey = (env: Pick<Env, 'OWNER_KEY'>) =>
  env.OWNER_KEY && env.OWNER_KEY.length >= MIN_OWNER_KEY_LENGTH ? env.OWNER_KEY : undefined;

const encoder = new TextEncoder();
const digest = async (value: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const signingKey = (key: string) =>
  crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
const ticketData = (instanceId: string, expires: number) =>
  encoder.encode(`sync:${instanceId}:${expires}`);

// Compares fixed-length digests in constant time, so timing reveals nothing about the key.
export async function matchesKey(candidate: string, key: string) {
  const [a, b] = await Promise.all([digest(candidate), digest(key)]);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export function bearer(header: string | undefined) {
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
}

// Browsers cannot set headers on a WebSocket, so sync opens with a ticket instead of the key:
// `<expiry ms>.<HMAC of the notebook ID and expiry>`. It is stateless, so it can be replayed
// until it expires a minute later, but it never carries the owner key into a URL or log.
export async function createTicket(key: string, instanceId: string, now = Date.now()) {
  const expires = now + TICKET_SECONDS * 1000;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await signingKey(key),
    ticketData(instanceId, expires),
  );
  return `${expires}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyTicket(
  key: string,
  instanceId: string,
  ticket: string,
  now = Date.now(),
) {
  const match = /^(\d{13})\.([\w-]{43})$/.exec(ticket);
  if (!match) return false;
  const expires = Number(match[1]);
  if (expires <= now || expires > now + TICKET_SECONDS * 1000) return false;
  return crypto.subtle.verify(
    'HMAC',
    await signingKey(key),
    fromBase64Url(match[2]),
    ticketData(instanceId, expires),
  );
}

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function fromBase64Url(text: string) {
  return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (char) =>
    char.charCodeAt(0),
  );
}
