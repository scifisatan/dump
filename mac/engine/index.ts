// The notebook engine the Mac app runs in JavaScriptCore: the web app's own client core (capture,
// filing, TinyBase sync) behind a small API the Swift host calls as `DumpEngine`. Polyfills load
// first, before TinyBase and Zod initialize.
import './polyfills';
import { createDumpClient, type Snapshot } from '../../src/core/client';
import {
  ConnectionError,
  inspectServer,
  profileSchema,
  requestTicket,
  serverUrl,
} from '../../src/core/connection';
import { dumpSchema, listPrefix } from '../../src/shared/schema';
import { native } from './native';
import { deviceEvents, macPlatform } from './platform';

type Client = ReturnType<typeof createDumpClient>;
let client: Client | undefined;
let unsubscribe = () => {};

const RECENT = 6;
const TEXT_LIMIT = dumpSchema.shape.text.maxLength ?? 20_000;

// What the panel and menu show: a compact view of the snapshot, not the whole notebook.
function view(snapshot: Snapshot) {
  const open = snapshot.dumps.filter((dump) => !dump.deleted && !dump.done);
  return {
    ready: snapshot.ready,
    sync: snapshot.sync,
    syncError: snapshot.syncError,
    saving: snapshot.saving,
    storageError: snapshot.storageError,
    lists: snapshot.lists
      .filter((list) => !list.deleted)
      .map(({ id, label, color }) => ({ id, label, color })),
    recent: snapshot.dumps
      .filter((dump) => !dump.deleted)
      .slice(0, RECENT)
      .map((dump) => ({
        id: dump.id,
        text: dump.text,
        list: dump.list,
        done: dump.done,
        url: dump.url,
        createdAt: dump.created_at,
        sorting: snapshot.sorting.has(dump.id),
      })),
    inbox: open.filter((dump) => !dump.list).length,
  };
}

function current() {
  if (!client) throw new Error('No notebook is open.');
  return client;
}

// The same wording the web app uses when a server cannot be checked.
function explain(cause: unknown, fallback: string) {
  if (cause instanceof TypeError)
    return 'Could not reach this server. Check the address and that it is online.';
  // The server refuses origins it does not list before anything else (src/server/origins.ts).
  if (cause instanceof ConnectionError && cause.message.includes('(403)'))
    return 'This server does not allow the Mac app’s web app address. Add it to ALLOWED_CLIENT_ORIGINS on the server, or change it under Advanced.';
  return cause instanceof Error ? cause.message : fallback;
}

const engine = {
  // Opens one notebook (a profile from the host's registry), closing any other first.
  async open(config: string) {
    const profile = profileSchema.parse(JSON.parse(config));
    await engine.close();
    const next = createDumpClient(macPlatform(profile));
    client = next;
    unsubscribe = next.subscribe(() => native.changed());
    await next.start();
    native.changed();
  },

  // Flushes and closes the open notebook. A failed save throws and leaves it open and usable.
  async close() {
    if (!client) return;
    await client.stop();
    unsubscribe();
    client = undefined;
  },

  snapshot() {
    return JSON.stringify(client ? view(client.getSnapshot()) : null);
  },

  // The list an explicit `!list` prefix in this draft files to, if any.
  listFor(text: string) {
    return client ? (listPrefix(text, client.getSnapshot().lists)?.list ?? null) : null;
  },

  // Captures synchronously, like the web composer. `list` files it when the text has no prefix
  // of its own; otherwise Jev sorts it afterwards when the server has it.
  capture(text: string, list: string | null) {
    const notebook = current();
    if (text.trim().length > TEXT_LIMIT)
      throw new Error(`A dump can be up to ${TEXT_LIMIT.toLocaleString('en-US')} characters.`);
    const prefixed = listPrefix(text, notebook.getSnapshot().lists);
    const dump = notebook.capture(list && !prefixed ? `!${list} ${text}` : text);
    return JSON.stringify({ id: dump.id, list: dump.list });
  },

  reconnect() {
    current().reconnect();
  },

  network(online: boolean) {
    deviceEvents.network(online);
  },

  resume() {
    deviceEvents.resume();
  },

  suspend() {
    deviceEvents.suspend();
  },

  // Settings: find a Dump server at an address, then check an owner key against it. Nothing is
  // saved by either.
  async inspect(address: string) {
    try {
      const baseUrl = serverUrl(address);
      const info = await inspectServer(baseUrl);
      return JSON.stringify({
        baseUrl,
        instanceId: info.instanceId,
        auth: info.auth,
        classify: info.classify,
      });
    } catch (cause) {
      throw new Error(explain(cause, 'Could not check this server.'), { cause });
    }
  },

  async verify(baseUrl: string, key: string) {
    try {
      await requestTicket(baseUrl, key);
    } catch (cause) {
      throw new Error(explain(cause, 'Could not connect to this server.'), { cause });
    }
  },
};

(globalThis as unknown as { DumpEngine: typeof engine }).DumpEngine = engine;
