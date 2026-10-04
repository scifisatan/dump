import type { MergeableStore } from 'tinybase';
import type { AnyPersister } from 'tinybase/persisters';
import type { PingResult } from '../shared/api';
import type { ClassifyRequest } from '../shared/classify';
import {
  collectionSchema,
  DEFAULT_LISTS,
  dumpSchema,
  encodeCollection,
  decodeDump,
  encodeDump,
  exportSchema,
  makeDump,
  type Collection,
  type Dump,
  type ListId,
} from '../shared/schema';
import { newStore, readRows } from '../shared/merge';
import { ClassifyUnavailable, classifyRequest } from './classify';
import { ConnectionError, Unauthorized } from './connection';

// `local`: a device-only notebook with no server. `signed-out`: the server refused the owner key;
// sync waits for reconnect() once the key is entered again.
export type SyncState =
  | 'connecting'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error'
  | 'local'
  | 'signed-out';
export type Snapshot = {
  ready: boolean;
  dumps: Dump[];
  lists: Collection[];
  saving: boolean;
  storageError: string | null;
  sync: SyncState;
  localServer: boolean;
  syncError: string | null;
  sorting: ReadonlySet<string>;
};
const TEXT_LIMIT = dumpSchema.shape.text.maxLength ?? 20_000;

export type SyncHandle = { start(): Promise<void>; destroy(): Promise<void> };
export type ServerLink = {
  inspect(signal: AbortSignal): Promise<PingResult>;
  connect(
    store: MergeableStore,
    info: PingResult,
    signal: AbortSignal,
    closed: () => void,
  ): Promise<SyncHandle>;
  classify(request: ClassifyRequest, signal: AbortSignal): Promise<ListId | null>;
};
export type ClientPlatform = {
  // Where this device keeps the notebook: a TinyBase persister for `store` that passes the
  // failures TinyBase would otherwise ignore to `onError`, and whether nothing is saved there yet.
  storage(
    store: MergeableStore,
    onError: (error: unknown) => void,
  ): { persister: AnyPersister; isEmpty(): Promise<boolean> };
  // What to tell the owner when this device cannot save.
  storageFailure: string;
  // Null for a notebook kept only on this device: no sync and no AI filing.
  server: ServerLink | null;
  isOnline(): boolean;
  watch(resume: () => void, offline: () => void, suspend: () => void): () => void;
  tabs(store: MergeableStore): SyncHandle;
};

// The notebook's storage as the client uses it. TinyBase reports save failures to `onError`
// instead of rejecting, so each step throws a failure recorded meanwhile.
function openStorage(
  platform: ClientPlatform,
  store: MergeableStore,
  status: (saving: boolean, error: string | null) => void,
) {
  const report = platform.storageFailure;
  let failure: unknown;
  const { persister, isEmpty } = platform.storage(store, (error) => {
    failure = error;
    status(false, report);
  });
  const listener = persister.addStatusListener((_persister, value) => {
    if (value === 2) failure = undefined;
    status(value === 2, failure ? report : null);
  });
  const check = () => {
    if (failure) throw new Error(report);
  };
  const statusChange = () =>
    new Promise<void>((resolve) => {
      const waiting = persister.addStatusListener(() => {
        persister.delListener(waiting);
        resolve();
      });
    });
  return {
    async load() {
      // A new notebook is written once before it is read.
      if (await isEmpty()) {
        await persister.save();
        check();
      }
      await persister.load();
      check();
    },
    async save() {
      // TinyBase announces a save only when it is idle. Starting while an auto-save is in flight
      // would leave that auto-save's failure standing, though this save writes everything.
      while (persister.getStatus() !== 0) await statusChange();
      await persister.save();
      check();
    },
    async start() {
      await persister.startAutoSave();
      check();
    },
    async destroy() {
      await persister.destroy();
      persister.delListener(listener);
    },
  };
}

// One instance owns one notebook. UI and host runtimes are adapters, not dependencies.
export function createDumpClient(platform: ClientPlatform) {
  const store = newStore();
  let snapshot: Snapshot = {
    ready: false,
    dumps: [],
    lists: DEFAULT_LISTS,
    saving: false,
    storageError: null,
    sync: platform.server ? 'connecting' : 'local',
    localServer: false,
    syncError: null,
    sorting: new Set(),
  };
  const listeners = new Set<() => void>();
  const emit = (patch: Partial<Snapshot> = {}) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  const persistence = openStorage(platform, store, (saving, storageError) =>
    emit({ saving, storageError }),
  );
  let lifetime = new AbortController();
  let stopped = false;
  let stopping = false;
  const running = () => snapshot.ready && !stopped && !stopping;
  const assertReady = () => {
    if (!running()) throw new Error('Still opening your notebook.');
  };
  let startPromise: Promise<void> | undefined;
  let stopPromise: Promise<void> | undefined;
  let sync: SyncHandle | undefined;
  let attempt: AbortController | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 1000;
  let signedOut = false;
  let unwatch = () => {};
  let tabs: SyncHandle | undefined;
  let transactionListener: string | undefined;

  async function disconnect() {
    clearTimeout(reconnectTimer);
    attempt?.abort();
    attempt = undefined;
    const previous = sync;
    sync = undefined;
    await previous?.destroy();
  }

  function scheduleReconnect() {
    if (!running()) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => void syncNow(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30_000);
  }

  async function syncNow() {
    const server = platform.server;
    if (!server || signedOut || !running() || sync || attempt) return;
    if (!platform.isOnline()) {
      emit({ sync: 'offline', syncError: null });
      return;
    }
    clearTimeout(reconnectTimer);
    const current = new AbortController();
    attempt = current;
    emit({ sync: 'syncing', syncError: null });
    try {
      // No store data leaves this client until identity and compatibility are checked.
      const info = await server.inspect(current.signal);
      if (current.signal.aborted || !running()) return;
      classify = info.classify ? 'on' : 'off';
      emit({ localServer: info.mode === 'local' });
      const connection = await server.connect(store, info, current.signal, () => {
        if (current.signal.aborted) return;
        void disconnect();
        emit({
          sync: platform.isOnline() ? 'error' : 'offline',
          syncError: 'Sync disconnected. It will reconnect automatically.',
        });
        scheduleReconnect();
      });
      if (current.signal.aborted || !running()) {
        await connection.destroy();
        return;
      }
      sync = connection;
      await connection.start();
      if (current.signal.aborted || !running()) return;
      retryDelay = 1000;
      emit({ sync: 'synced' });
      sortUnfiled();
    } catch (error) {
      if (current.signal.aborted) return;
      await disconnect();
      if (!running()) return;
      classify = 'unknown';
      if (error instanceof Unauthorized) {
        signedOut = true;
        emit({
          sync: 'signed-out',
          syncError: 'This device is signed out. Enter the owner key in Settings to sync again.',
        });
        return;
      }
      emit({
        sync: platform.isOnline() ? 'error' : 'offline',
        syncError:
          error instanceof ConnectionError
            ? error.message
            : 'Sync is unavailable. It will retry automatically.',
      });
      scheduleReconnect();
    } finally {
      if (attempt === current && !sync) attempt = undefined;
    }
  }

  function start() {
    if (stopped)
      return Promise.reject(
        new Error('This notebook is closed. Create a new client to reopen it.'),
      );
    return (startPromise ??= (async () => {
      await persistence.load();
      transactionListener = store.addDidFinishTransactionListener(() => emit(readRows(store)));
      emit(readRows(store));
      await persistence.start();
      emit({ ready: true });
      tabs = platform.tabs(store);
      const tabStart = tabs.start();
      unwatch = platform.watch(
        () => {
          retryDelay = 1000;
          void syncNow();
        },
        () => {
          if (!platform.server || signedOut) return;
          void disconnect();
          emit({ sync: 'offline', syncError: null });
        },
        () => {
          void persistence.save().catch(() => {});
        },
      );
      void syncNow();
      await tabStart;
    })());
  }

  function stop() {
    return (stopPromise ??= (async () => {
      if (!startPromise) {
        stopped = true;
        lifetime.abort();
        await persistence.destroy();
        return;
      }
      await startPromise;
      stopping = true;
      emit({ ready: false, sorting: new Set() });
      lifetime.abort();
      await disconnect();
      await tabs?.destroy();
      queue.length = 0;
      try {
        // A failed save prevents switching. The old notebook remains usable.
        await persistence.save();
      } catch (error) {
        stopping = false;
        stopPromise = undefined;
        lifetime = new AbortController();
        emit({ ready: true });
        tabs = platform.tabs(store);
        await tabs.start();
        void syncNow();
        throw error;
      }
      stopped = true;
      unwatch();
      if (transactionListener) store.delListener(transactionListener);
      await persistence.destroy();
      emit({ sorting: new Set(), sync: 'offline' });
    })());
  }

  // Capture is synchronous and usually unfiled; Jev chooses the list afterwards (see autoFile).
  // An explicit !list prefix files it immediately, as does `list`, the list being captured into.
  function capture(raw: string, list: ListId | null = null) {
    assertReady();
    if (raw.trim().length > TEXT_LIMIT)
      throw new Error(`A dump can be up to ${TEXT_LIMIT.toLocaleString('en-US')} characters.`);
    const dump = makeDump(raw, crypto.randomUUID(), Date.now(), snapshot.lists, list);
    store.setRow('dumps', dump.id, { data: encodeDump(dump) });
    if (!dump.list) setTimeout(() => autoFile(dump.id), 0);
    return dump;
  }

  // With Jev configured, every dump ends up in a list: Jev's choice, else To do. Unfiled open
  // dumps are the durable queue, so a closed tab or failed request is retried on the next load
  // or reconnect. Without Jev, or with fewer than two lists, dumps stay in the inbox for the
  // owner to sort (Sort inbox).
  const DEFAULT_LIST = 'todo';
  let classify: 'unknown' | 'on' | 'off' = 'unknown';
  const queue: string[] = [];
  let active = 0;

  const needsList = (dump: Dump | undefined): dump is Dump =>
    !!dump && !dump.list && !dump.deleted && !dump.done && dump.classified_by === null;
  const findDump = (id: string) => snapshot.dumps.find((dump) => dump.id === id);
  const listExists = (id: string | null) =>
    snapshot.lists.some((list) => list.id === id && !list.deleted);
  // With fewer than two lists there is no real choice to make, so dumps stay in the inbox.
  const jevUseful = () =>
    classify === 'on' && snapshot.lists.filter((list) => !list.deleted).length >= 2;

  function sortUnfiled() {
    for (const dump of snapshot.dumps) if (needsList(dump)) autoFile(dump.id, false);
  }

  function autoFile(id: string, first = true) {
    if (!running() || !jevUseful() || !needsList(findDump(id))) return;
    if (snapshot.sorting.has(id) || queue.includes(id)) return;
    // New captures jump ahead of a backlog sweep.
    if (first) queue.unshift(id);
    else queue.push(id);
    emit({ sorting: new Set([...snapshot.sorting, id]) });
    pump();
  }

  function pump() {
    while (running() && active < 3) {
      const id = queue.shift();
      if (id === undefined) return;
      active++;
      void sortOne(id).finally(() => {
        active--;
        const sorting = new Set(snapshot.sorting);
        sorting.delete(id);
        emit({ sorting });
        pump();
      });
    }
  }

  async function sortOne(id: string) {
    const signal = lifetime.signal;
    const dump = findDump(id);
    const server = platform.server;
    if (!needsList(dump) || !server) return;
    if (!jevUseful()) return;
    const request = classifyRequest(dump.text, snapshot.lists);
    let list: string | null = null;
    // A bare link has nothing for Jev to judge, so it goes straight to the fallback.
    if (request) {
      if (!platform.isOnline()) return; // Retried when the connection returns.
      try {
        list = await server.classify(request, signal);
      } catch (error) {
        // Turned off on the server: leave it in the inbox. A refused key pauses filing until the
        // next successful sync. Otherwise retry on the next load.
        if (!signal.aborted && error instanceof ClassifyUnavailable) classify = 'off';
        if (!signal.aborted && error instanceof Unauthorized) classify = 'unknown';
        return;
      }
    }
    if (signal.aborted || !running()) return;
    // The owner may have filed, completed or removed it while Jev was thinking; they win.
    if (!needsList(findDump(id))) return;
    if (listExists(list)) write(id, { list, classified_by: 'ai' });
    else if (listExists(DEFAULT_LIST)) write(id, { list: DEFAULT_LIST });
  }

  // Callers use the commands below, which keep `classified_by` consistent with `needsList`.
  function write(
    id: string,
    changes: Partial<Pick<Dump, 'list' | 'done' | 'deleted' | 'classified_by'>>,
  ) {
    assertReady();
    const previous = decodeDump(store.getCell('dumps', id, 'data'));
    store.setCell(
      'dumps',
      id,
      'data',
      encodeDump({ ...previous, ...changes, updated_at: Date.now() }),
    );
  }

  // The dump an action names; it may have been removed on another device meanwhile.
  function existing(id: string) {
    assertReady();
    const dump = findDump(id);
    if (!dump || dump.deleted) throw new Error('This dump is no longer in your notebook.');
    return dump.id;
  }

  function setDone(id: string, done: boolean) {
    write(existing(id), { done });
  }

  // Filing by hand, including back to the inbox (null), records the owner's choice, so Jev
  // leaves it alone.
  function file(id: string, list: ListId | null) {
    const target = existing(id);
    if (list !== null && !listExists(list)) throw new Error('That list no longer exists.');
    write(target, { list, classified_by: 'user' });
  }

  function remove(id: string) {
    write(existing(id), { deleted: true });
  }

  function saveList(label: string, color: string, id?: string) {
    assertReady();
    const existing = snapshot.lists.find((list) => list.id === id);
    if (
      snapshot.lists.some(
        (list) =>
          !list.deleted &&
          list.id !== id &&
          list.label.toLowerCase() === label.trim().toLowerCase(),
      )
    )
      throw new Error('A list with that name already exists.');
    if (!existing && snapshot.lists.length >= 500)
      throw new Error('Your space has reached its list limit.');
    const list = collectionSchema.parse({
      id: existing?.id ?? crypto.randomUUID(),
      label,
      color,
      position:
        existing?.position ?? Math.max(0, ...snapshot.lists.map((item) => item.position)) + 1,
      deleted: false,
    });
    store.setRow('lists', list.id, { data: encodeCollection(list) });
    return list;
  }

  // Tombstones the list and moves its dumps (open and done) back to the inbox, unclassified, so
  // autoFile sorts the open ones again.
  function deleteList(id: string) {
    assertReady();
    const list = snapshot.lists.find((item) => item.id === id);
    if (!list) return;
    store.transaction(() => {
      store.setRow('lists', id, { data: encodeCollection({ ...list, deleted: true }) });
      for (const dump of snapshot.dumps)
        if (dump.list === id) write(dump.id, { list: null, classified_by: null });
    });
  }

  // Tombstones every completed dump; returns how many were cleared.
  function clearDone() {
    assertReady();
    const done = snapshot.dumps.filter((dump) => dump.done && !dump.deleted);
    store.transaction(() => {
      for (const dump of done) write(dump.id, { deleted: true });
    });
    return done.length;
  }

  // Additive restore: preserves IDs, never overwrites newer or existing records.
  function importDumps(input: unknown): number {
    assertReady();
    const backup = exportSchema.parse(input);
    let added = 0;
    store.transaction(() => {
      for (const list of backup.lists) {
        if (!store.hasRow('lists', list.id))
          store.setRow('lists', list.id, { data: encodeCollection(list) });
      }
      for (const dump of backup.dumps) {
        if (!store.hasRow('dumps', dump.id)) {
          store.setRow('dumps', dump.id, { data: encodeDump(dump) });
          added++;
        }
      }
    });
    return added;
  }

  function backup() {
    return {
      app: 'dump' as const,
      exported_at: new Date().toISOString(),
      dumps: snapshot.dumps,
      lists: snapshot.lists,
    };
  }
  // After a refused key is replaced, sync resumes without reopening the notebook.
  function reconnect() {
    signedOut = false;
    retryDelay = 1000;
    emit({ syncError: null });
    void syncNow();
  }

  return {
    start,
    stop,
    syncNow,
    reconnect,
    capture,
    setDone,
    file,
    remove,
    saveList,
    deleteList,
    clearDone,
    importDumps,
    backup,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
