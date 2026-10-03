import type { MergeableStore } from 'tinybase';
import type { PingResult } from '../shared/api';
import type { ClassifyRequest } from '../shared/classify';
import {
  collectionSchema,
  DEFAULT_LISTS,
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
export type SyncHandle = { start(): Promise<void>; destroy(): Promise<void> };
export type Persistence = {
  load(): Promise<void>;
  save(): Promise<void>;
  start(): Promise<void>;
  destroy(): Promise<void>;
};
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
  persistence(
    store: MergeableStore,
    status: (saving: boolean, error: string | null) => void,
  ): Persistence;
  // Null for a notebook kept only on this device: no sync and no AI filing.
  server: ServerLink | null;
  isOnline(): boolean;
  watch(resume: () => void, offline: () => void, suspend: () => void): () => void;
  tabs(store: MergeableStore): SyncHandle;
};

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
  const persistence = platform.persistence(store, (saving, storageError) =>
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
  // An explicit !list prefix files it immediately.
  function capture(raw: string) {
    assertReady();
    const dump = makeDump(raw, crypto.randomUUID(), Date.now(), snapshot.lists);
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
    if (listExists(list)) updateDump(id, { list, classified_by: 'ai' });
    else if (listExists(DEFAULT_LIST)) updateDump(id, { list: DEFAULT_LIST });
  }

  function updateDump(
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

  // Tombstones the list and moves its dumps (open and done) back to the inbox.
  function deleteList(id: string) {
    assertReady();
    const list = snapshot.lists.find((item) => item.id === id);
    if (!list) return;
    store.transaction(() => {
      store.setRow('lists', id, { data: encodeCollection({ ...list, deleted: true }) });
      for (const dump of snapshot.dumps) if (dump.list === id) updateDump(dump.id, { list: null });
    });
  }

  // Tombstones every completed dump; returns how many were cleared.
  function clearDone() {
    assertReady();
    const done = snapshot.dumps.filter((dump) => dump.done && !dump.deleted);
    store.transaction(() => {
      for (const dump of done) updateDump(dump.id, { deleted: true });
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
    updateDump,
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
