import { describe, expect, it, vi } from 'vite-plus/test';
import type { MergeableStore } from 'tinybase';
import { createDumpClient, type ClientPlatform } from '../src/core/client';
import type { PingResult } from '../src/shared/api';
import { ConnectionError, Unauthorized } from '../src/core/connection';

const info: PingResult = {
  ok: true,
  app: 'dump',
  instanceId: 'a'.repeat(64),
  syncProtocol: 'tinybase-ws',
  auth: 'owner-key',
  mode: 'local',
  classify: true,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Explicit in-memory platform exercises the same core used by the browser; no module mocks.
function platform({ deviceOnly = false } = {}) {
  let content: ReturnType<MergeableStore['getMergeableContent']> | undefined;
  const state = {
    connections: 0,
    destroyed: 0,
    watches: 0,
    tabs: 0,
    failSave: false,
    calls: 0,
    inspections: 0,
    inspect: async (): Promise<PingResult> => info,
    classify: async (_signal: AbortSignal): Promise<string | null> => 'buy',
  };
  const adapter: ClientPlatform = {
    persistence(store, status) {
      const save = async () => {
        if (state.failSave) {
          status(false, 'Disk unavailable');
          throw new Error('Disk unavailable');
        }
        content = store.getMergeableContent();
        status(false, null);
      };
      return {
        async load() {
          if (content) store.setMergeableContent(content);
        },
        save,
        async start() {},
        async destroy() {},
      };
    },
    server: deviceOnly
      ? null
      : {
          inspect: () => {
            state.inspections++;
            return state.inspect();
          },
          async connect() {
            state.connections++;
            return {
              async start() {},
              async destroy() {
                state.destroyed++;
              },
            };
          },
          classify: (_request, signal) => {
            state.calls++;
            return state.classify(signal);
          },
        },
    isOnline: () => true,
    watch() {
      state.watches++;
      return () => {
        state.watches--;
      };
    },
    tabs() {
      state.tabs++;
      return {
        async start() {},
        async destroy() {
          state.tabs--;
        },
      };
    },
  };
  return { adapter, state };
}

describe('client lifecycle and isolation', () => {
  it('updates memory synchronously, defers AI, and persists a notebook across clients', async () => {
    const host = platform();
    const client = createDumpClient(host.adapter);
    await client.start();
    await vi.waitFor(() => expect(client.getSnapshot().sync).toBe('synced'));
    const dump = client.capture('ceramic kettle');
    expect(client.getSnapshot().dumps[0].id).toBe(dump.id);
    expect(host.state.calls).toBe(0);
    await vi.waitFor(() => expect(client.getSnapshot().dumps[0].list).toBe('buy'));
    await client.stop();
    expect(host.state.watches).toBe(0);
    expect(host.state.tabs).toBe(0);
    const reopened = createDumpClient(host.adapter);
    await reopened.start();
    expect(reopened.getSnapshot().dumps[0].id).toBe(dump.id);
    await reopened.stop();
  });

  it('a late AI response cannot mutate a stopped notebook or another client', async () => {
    const host = platform();
    const answer = deferred<string | null>();
    let signal: AbortSignal | undefined;
    host.state.classify = (received) => {
      signal = received;
      return answer.promise;
    };
    const a = createDumpClient(host.adapter);
    const b = createDumpClient(platform().adapter);
    await a.start();
    await vi.waitFor(() => expect(a.getSnapshot().sync).toBe('synced'));
    a.capture('late classification');
    await vi.waitFor(() => expect(host.state.calls).toBe(1));
    await a.stop();
    expect(signal?.aborted).toBe(true);
    await b.start();
    b.capture('!ideas separate notebook');
    answer.resolve('buy');
    await answer.promise;
    expect(a.getSnapshot().dumps[0].list).toBeNull();
    expect(b.getSnapshot().dumps.map((dump) => dump.text)).toEqual(['separate notebook']);
    await b.stop();
  });

  it('does not connect after a pending identity check resolves on a closed client', async () => {
    const host = platform();
    const check = deferred<PingResult>();
    host.state.inspect = () => check.promise;
    const client = createDumpClient(host.adapter);
    await client.start();
    await client.stop();
    check.resolve(info);
    await check.promise;
    expect(host.state.connections).toBe(0);
    expect(() => client.capture('closed')).toThrow();
    await expect(client.start()).rejects.toThrow('closed');
  });

  it('never uploads local data when identity validation fails', async () => {
    const host = platform();
    host.state.inspect = async () => {
      throw new ConnectionError('Different notebook');
    };
    const client = createDumpClient(host.adapter);
    await client.start();
    client.capture('!ideas local only');
    await vi.waitFor(() => expect(client.getSnapshot().syncError).toBe('Different notebook'));
    expect(host.state.connections).toBe(0);
    expect(client.getSnapshot().dumps).toHaveLength(1);
    await client.stop();
  });

  it('a device-only notebook saves locally and never syncs or files', async () => {
    const host = platform({ deviceOnly: true });
    const client = createDumpClient(host.adapter);
    await client.start();
    expect(client.getSnapshot().sync).toBe('local');
    client.capture('ceramic kettle');
    await client.syncNow();
    await client.stop();
    const reopened = createDumpClient(host.adapter);
    await reopened.start();
    expect(reopened.getSnapshot().dumps.map((dump) => [dump.text, dump.list])).toEqual([
      ['ceramic kettle', null],
    ]);
    expect(host.state.connections + host.state.calls).toBe(0);
    await reopened.stop();
  });

  it('a refused key signs out without retrying until reconnect', async () => {
    const host = platform();
    host.state.inspect = async () => {
      throw new Unauthorized('Wrong owner key.');
    };
    const client = createDumpClient(host.adapter);
    await client.start();
    await vi.waitFor(() => expect(client.getSnapshot().sync).toBe('signed-out'));
    client.capture('!ideas kept while signed out');
    await client.syncNow();
    expect(host.state.inspections).toBe(1);
    host.state.inspect = async () => info;
    client.reconnect();
    await vi.waitFor(() => expect(client.getSnapshot().sync).toBe('synced'));
    expect(client.getSnapshot().dumps).toHaveLength(1);
    await client.stop();
  });

  it('a failed flush prevents closing and leaves local capture usable', async () => {
    const host = platform();
    const client = createDumpClient(host.adapter);
    await client.start();
    client.capture('!ideas retained');
    host.state.failSave = true;
    await expect(client.stop()).rejects.toThrow('Disk unavailable');
    client.capture('!ideas still usable');
    expect(client.getSnapshot().dumps).toHaveLength(2);
    host.state.failSave = false;
    await client.stop();
    expect(host.state.tabs).toBe(0);
    expect(host.state.watches).toBe(0);
  });
});
