// The notebook engine the Mac app runs in JavaScriptCore: the web app's own client core (capture,
// filing, TinyBase sync) behind a small API the Swift host calls as `DumpEngine`. Polyfills load
// first, before TinyBase and Zod initialize.
import './polyfills';
import { createDumpClient, type Snapshot } from '../../src/core/client';
import {
  explainConnectionError,
  inspectServer,
  profileSchema,
  requestTicket,
  serverUrl,
} from '../../src/core/connection';
import { listPrefix, listSchema, type Dump } from '../../src/shared/schema';
import { native } from './native';
import { deviceEvents, macPlatform } from './platform';

type Client = ReturnType<typeof createDumpClient>;
let client: Client | undefined;
let unsubscribe = () => {};

const RECENT = 6;

// One dump as the Mac app shows it.
function item(dump: Dump, snapshot: Snapshot) {
  return {
    id: dump.id,
    text: dump.text,
    list: dump.list,
    tags: dump.tags,
    done: dump.done,
    url: dump.url,
    createdAt: dump.created_at,
    sorting: snapshot.sorting.has(dump.id),
  };
}

// What the panel and menu show: a compact view of the snapshot. `full` adds every dump, for the
// notebook window, which is not worth encoding on each change while the window is closed.
function view(snapshot: Snapshot, full: boolean) {
  const active = snapshot.dumps.filter((dump) => !dump.deleted);
  return {
    ready: snapshot.ready,
    sync: snapshot.sync,
    syncError: snapshot.syncError,
    saving: snapshot.saving,
    storageError: snapshot.storageError,
    lists: snapshot.lists
      .filter((list) => !list.deleted)
      .map(({ id, label, color }) => ({ id, label, color })),
    recent: active.slice(0, RECENT).map((dump) => item(dump, snapshot)),
    dumps: full ? active.map((dump) => item(dump, snapshot)) : [],
    inbox: active.filter((dump) => !dump.done && !dump.list).length,
  };
}

function current() {
  if (!client) throw new Error('No notebook is open.');
  return client;
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

  snapshot(full: boolean) {
    return JSON.stringify(client ? view(client.getSnapshot(), full) : null);
  },

  // The list an explicit `!list` prefix in this draft files to, if any.
  listFor(text: string) {
    return client ? (listPrefix(text, client.getSnapshot().lists)?.list ?? null) : null;
  },

  // Captures synchronously, like the web composer. `list` files it when the text has no prefix
  // of its own; otherwise Jev sorts it afterwards when the server has it.
  capture(text: string, list: string | null) {
    const dump = current().capture(text, list);
    return JSON.stringify({ id: dump.id, list: dump.list });
  },

  // The core's dump actions (src/core/client.ts). All are final; there is no undo.
  setDone(id: string, done: boolean) {
    current().setDone(id, done);
  },

  file(id: string, list: string | null) {
    current().file(id, list);
  },

  remove(id: string) {
    current().remove(id);
  },

  // Creates a list, or renames and recolors one when `id` is given.
  saveList(label: string, color: string, id: string | null) {
    const list = current().saveList(label, color, id ?? undefined);
    return JSON.stringify({ id: list.id, label: list.label, color: list.color });
  },

  // Tombstones the list; its dumps return to the inbox for Jev or the owner to sort again.
  deleteList(id: string) {
    current().deleteList(listSchema.parse(id));
  },

  clearDone() {
    return current().clearDone();
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
      throw new Error(explainConnectionError(cause, 'Could not check this server.'), { cause });
    }
  },

  async verify(baseUrl: string, key: string) {
    try {
      await requestTicket(baseUrl, key);
    } catch (cause) {
      throw new Error(explainConnectionError(cause, 'Could not connect to this server.'), {
        cause,
      });
    }
  },
};

(globalThis as unknown as { DumpEngine: typeof engine }).DumpEngine = engine;
