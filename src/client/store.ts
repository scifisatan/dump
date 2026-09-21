import { useSyncExternalStore } from 'react';
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db';
import { createBroadcastChannelSynchronizer } from 'tinybase/synchronizers/synchronizer-broadcast-channel';
import {
  createWsSynchronizer,
  type WsSynchronizer,
} from 'tinybase/synchronizers/synchronizer-ws-client';
import { hc } from 'hono/client';
import type { Api } from '../shared/api';
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
} from '../shared/schema';
import { ClassifyUnavailable, classifyRequest, requestList } from './classify';
import { newStore, readRows, SYNC_FRAGMENT_BYTES, SYNC_TIMEOUT_SECONDS } from '../shared/merge';

export const store = newStore();
type SyncState = 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';
type Snapshot = {
  ready: boolean;
  dumps: Dump[];
  lists: Collection[];
  saving: boolean;
  storageError: string | null;
  sync: SyncState;
  localServer: boolean;
  syncError: string | null;
  // Dumps waiting for Jev to choose their list.
  sorting: ReadonlySet<string>;
};
let snapshot: Snapshot = {
  ready: false,
  dumps: [],
  lists: DEFAULT_LISTS,
  saving: false,
  storageError: null,
  sync: 'connecting',
  localServer: false,
  syncError: null,
  sorting: new Set(),
};
const listeners = new Set<() => void>();
const emit = (patch: Partial<Snapshot> = {}) => {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
};
export const useDumpStore = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => snapshot,
  );

let persistenceFailure: unknown;
export const persister = createIndexedDbPersister(store, 'dump-v1', 1, (error) => {
  if (import.meta.env.DEV) console.error('Local persistence failed', error);
  persistenceFailure = error;
  emit({
    storageError: 'This browser could not save your changes. Keep this tab open and export a copy.',
  });
});
let readyPromise: Promise<void> | undefined;
let synchronizer: WsSynchronizer<WebSocket> | undefined;
let connecting = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 1000;
const api = hc<Api>('/');

const rebuild = () => emit(readRows(store));

export function initializeStore(): Promise<void> {
  return (readyPromise ??= (async () => {
    // TinyBase's first load reports NotFoundError for a brand-new database.
    // Initialize only an empty database; never overwrite an existing one on error.
    const empty = await new Promise<boolean>((resolve, reject) => {
      const request = indexedDB.open('dump-v1');
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other Dump tabs and retry.'));
      request.onsuccess = () => {
        const isEmpty = request.result.objectStoreNames.length === 0;
        request.result.close();
        resolve(isEmpty);
      };
    });
    if (empty) await persister.save();
    await persister.load();
    if (persistenceFailure)
      throw new Error('Your local storage could not be opened. Try reopening this browser.');
    rebuild();
    await persister.startAutoSave();
    if (persistenceFailure)
      throw new Error('Local storage is unavailable. Enable browser storage and retry.');
    persister.addStatusListener((_persister, status) => {
      // TinyBase reports save errors before returning to idle, so a clean save clears the banner.
      if (status === 2) persistenceFailure = undefined;
      emit(
        status === 0 && !persistenceFailure
          ? { saving: false, storageError: null }
          : { saving: status === 2 },
      );
    });
    store.addDidFinishTransactionListener(rebuild);
    emit({ ready: true });
    // Other open tabs on this device stay in step without a network round trip.
    if (typeof BroadcastChannel !== 'undefined')
      void createBroadcastChannelSynchronizer(store, 'dump-tabs').startSync();
    window.addEventListener('online', () => {
      retryDelay = 1000;
      void syncNow();
      checkClassify();
    });
    window.addEventListener('offline', () => {
      disconnect();
      emit({ sync: 'offline', syncError: null });
    });
    window.addEventListener('pagehide', () => {
      void persister.save();
    });
    document.addEventListener('visibilitychange', () => {
      // Mobile browsers drop sockets in the background; reconnect when the app returns.
      if (document.visibilityState === 'visible') void syncNow();
      else void persister.save();
    });
    checkClassify();
    void syncNow();
  })());
}

// Learns whether this deployment has Jev, then sorts anything still unfiled. Until the answer
// arrives (for example while offline), new dumps simply wait unfiled.
function checkClassify() {
  void api.api.ping
    .$get({})
    .then(async (response) => {
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const ping = await response.json();
        classify = ping.classify ? 'on' : 'off';
        emit({ localServer: ping.mode === 'local' });
        sortUnfiled();
      }
    })
    .catch(() => {});
}

function disconnect() {
  clearTimeout(reconnectTimer);
  synchronizer?.destroy();
  synchronizer = undefined;
}

// Connect TinyBase's WebSocket synchronizer if it is not already running. On connect it
// compares hashes with the server and exchanges only differing rows; afterwards every local
// change is sent as it happens, and changes from other devices arrive live.
export async function syncNow() {
  if (!snapshot.ready || synchronizer || connecting) return;
  if (!navigator.onLine) {
    emit({ sync: 'offline', syncError: null });
    return;
  }
  clearTimeout(reconnectTimer);
  connecting = true;
  emit({ sync: 'syncing', syncError: null });
  try {
    const socket = new WebSocket(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/sync`,
    );
    const connected = await createWsSynchronizer(
      store,
      socket,
      SYNC_TIMEOUT_SECONDS,
      undefined,
      undefined,
      undefined,
      SYNC_FRAGMENT_BYTES,
    );
    socket.addEventListener('close', () => {
      if (synchronizer !== connected) return;
      connected.destroy();
      synchronizer = undefined;
      if (!navigator.onLine) {
        emit({ sync: 'offline', syncError: null });
        return;
      }
      emit({ sync: 'error', syncError: 'Sync disconnected. It will reconnect automatically.' });
      scheduleReconnect();
    });
    synchronizer = connected;
    await connected.startSync();
    retryDelay = 1000;
    if (synchronizer === connected) emit({ sync: 'synced' });
  } catch {
    disconnect();
    emit({
      sync: navigator.onLine ? 'error' : 'offline',
      syncError: navigator.onLine ? 'Sync is unavailable. It will retry automatically.' : null,
    });
    scheduleReconnect();
  } finally {
    connecting = false;
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => void syncNow(), retryDelay);
  retryDelay = Math.min(retryDelay * 2, 30_000);
}

// Capture is synchronous and usually unfiled; Jev chooses the list afterwards (see autoFile).
// An explicit !list prefix files it immediately.
export function capture(raw: string) {
  if (!snapshot.ready) throw new Error('Still opening your notebook.');
  const dump = makeDump(raw, crypto.randomUUID(), Date.now(), snapshot.lists);
  store.setRow('dumps', dump.id, { data: encodeDump(dump) });
  if (!dump.list) queueMicrotask(() => autoFile(dump.id));
  return dump;
}

// With Jev configured, every dump ends up in a list: Jev's choice, else To do. Unfiled open
// dumps are the durable queue, so a closed tab or failed request is retried on the next load
// or reconnect. Without Jev, or with fewer than two lists, dumps stay in the inbox for the
// owner to sort (Sort inbox).
export const DEFAULT_LIST = 'todo';
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
  if (!jevUseful() || !needsList(findDump(id))) return;
  if (snapshot.sorting.has(id) || queue.includes(id)) return;
  // New captures jump ahead of a backlog sweep.
  if (first) queue.unshift(id);
  else queue.push(id);
  emit({ sorting: new Set([...snapshot.sorting, id]) });
  pump();
}

function pump() {
  while (active < 3) {
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
  const dump = findDump(id);
  if (!needsList(dump)) return;
  if (!jevUseful()) return;
  const request = classifyRequest(dump.text, snapshot.lists);
  let list: string | null = null;
  // A bare link has nothing for Jev to judge, so it goes straight to the fallback.
  if (request) {
    if (!navigator.onLine) return; // Retried when the connection returns.
    try {
      list = await requestList(request);
    } catch (error) {
      // Turned off on the server: leave it in the inbox. Otherwise retry on the next load.
      if (error instanceof ClassifyUnavailable) classify = 'off';
      return;
    }
  }
  // The owner may have filed, completed or removed it while Jev was thinking; they win.
  if (!needsList(findDump(id))) return;
  if (listExists(list)) updateDump(id, { list, classified_by: 'ai' });
  else if (listExists(DEFAULT_LIST)) updateDump(id, { list: DEFAULT_LIST });
}

export function updateDump(
  id: string,
  changes: Partial<Pick<Dump, 'list' | 'done' | 'deleted' | 'classified_by'>>,
) {
  const previous = decodeDump(store.getCell('dumps', id, 'data'));
  store.setCell(
    'dumps',
    id,
    'data',
    encodeDump({ ...previous, ...changes, updated_at: Date.now() }),
  );
}

export function saveList(label: string, color: string, id?: string) {
  if (!snapshot.ready) throw new Error('Still opening your notebook.');
  const existing = snapshot.lists.find((list) => list.id === id);
  if (
    snapshot.lists.some(
      (list) =>
        !list.deleted && list.id !== id && list.label.toLowerCase() === label.trim().toLowerCase(),
    )
  )
    throw new Error('A list with that name already exists.');
  if (!existing && snapshot.lists.length >= 500)
    throw new Error('Your space has reached its list limit.');
  const list = collectionSchema.parse({
    id: existing?.id ?? crypto.randomUUID(),
    label,
    color,
    position: existing?.position ?? Math.max(0, ...snapshot.lists.map((item) => item.position)) + 1,
    deleted: false,
  });
  store.setRow('lists', list.id, { data: encodeCollection(list) });
  return list;
}

// Tombstones the list and moves its dumps (open and done) back to the inbox.
export function deleteList(id: string) {
  if (!snapshot.ready) throw new Error('Still opening your notebook.');
  const list = snapshot.lists.find((item) => item.id === id);
  if (!list) return;
  store.transaction(() => {
    store.setRow('lists', id, { data: encodeCollection({ ...list, deleted: true }) });
    for (const dump of snapshot.dumps) if (dump.list === id) updateDump(dump.id, { list: null });
  });
}

// Tombstones every completed dump; returns how many were cleared.
export function clearDone() {
  const done = snapshot.dumps.filter((dump) => dump.done && !dump.deleted);
  store.transaction(() => {
    for (const dump of done) updateDump(dump.id, { deleted: true });
  });
  return done.length;
}

export function exportDumps() {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          app: 'dump',
          exported_at: new Date().toISOString(),
          dumps: snapshot.dumps,
          lists: snapshot.lists,
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `dump-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// Additive restore: preserves IDs, never overwrites newer or existing records.
export function importDumps(input: unknown): number {
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
