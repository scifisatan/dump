import { describe, expect, it } from 'vite-plus/test';
import {
  bearer,
  createTicket,
  matchesKey,
  MIN_OWNER_KEY_LENGTH,
  ownerKey,
  TICKET_SECONDS,
  verifyTicket,
} from '../src/server/auth';

const key = 'k'.repeat(MIN_OWNER_KEY_LENGTH);
const instanceId = 'a'.repeat(64);

describe('owner key', () => {
  it('counts a missing or short key as not configured', () => {
    expect(ownerKey({})).toBeUndefined();
    expect(ownerKey({ OWNER_KEY: 'short' })).toBeUndefined();
    expect(ownerKey({ OWNER_KEY: key })).toBe(key);
  });
  it('matches only the exact key from a bearer header', async () => {
    expect(await matchesKey(bearer(`Bearer ${key}`), key)).toBe(true);
    expect(await matchesKey(bearer(key), key)).toBe(false);
    expect(await matchesKey(bearer(undefined), key)).toBe(false);
    expect(await matchesKey(`${key}x`, key)).toBe(false);
  });
});

describe('sync tickets', () => {
  it('open this notebook for one minute without carrying the key', async () => {
    const now = Date.now();
    const ticket = await createTicket(key, instanceId, now);
    expect(ticket).not.toContain(key);
    expect(await verifyTicket(key, instanceId, ticket, now)).toBe(true);
    expect(await verifyTicket(key, instanceId, ticket, now + TICKET_SECONDS * 1000)).toBe(false);
  });
  it('reject another key, another notebook, and any edit', async () => {
    const now = Date.now();
    const ticket = await createTicket(key, instanceId, now);
    const [expiry, signature] = ticket.split('.');
    expect(await verifyTicket('r'.repeat(40), instanceId, ticket, now)).toBe(false);
    expect(await verifyTicket(key, 'b'.repeat(64), ticket, now)).toBe(false);
    expect(await verifyTicket(key, instanceId, `${Number(expiry) + 1}.${signature}`, now)).toBe(
      false,
    );
    expect(await verifyTicket(key, instanceId, `${expiry}.${'A'.repeat(43)}`, now)).toBe(false);
    expect(await verifyTicket(key, instanceId, '', now)).toBe(false);
  });
  it('reject tickets claiming to outlive a minute', async () => {
    const now = Date.now();
    const future = await createTicket(key, instanceId, now + 3_600_000);
    expect(await verifyTicket(key, instanceId, future, now)).toBe(false);
  });
});
