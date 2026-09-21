import { useSyncExternalStore } from 'react';
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db';
import { hc } from 'hono/client';
import type { Api } from '../shared/api';
import { collectionSchema, DEFAULT_LISTS, decodeCollection, encodeCollection, decodeDump, encodeDump, exportSchema, makeDump, SCHEMA_VERSION, type Collection, type Dump } from '../shared/schema';
import { MAX_SYNC_BYTES, mergeContent, newStore, validateContent } from '../shared/merge';

export const store = newStore();
type SyncState = 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';
type Snapshot = { ready: boolean; dumps: Dump[]; lists: Collection[]; saving: boolean; storageError: string | null; sync: SyncState; localServer: boolean; syncError: string | null };
let snapshot: Snapshot = { ready: false, dumps: [], lists: DEFAULT_LISTS, saving: false, storageError: null, sync: 'connecting', localServer: false, syncError: null };
const listeners = new Set<() => void>();
const emit = (patch: Partial<Snapshot> = {}) => { snapshot = { ...snapshot, ...patch }; listeners.forEach((listener) => listener()); };
export const useDumpStore = () => useSyncExternalStore((listener) => {
  listeners.add(listener); return () => { listeners.delete(listener); };
}, () => snapshot);

let persistenceFailure: unknown;
export const persister = createIndexedDbPersister(store, 'dump-v1', 1, (error) => {
  if (import.meta.env.DEV) console.error('Local persistence failed', error);
  persistenceFailure = error;
  emit({ storageError: 'This browser could not save your changes. Keep this tab open and export a copy.' });
});
let readyPromise: Promise<void> | undefined;
let revision = 0;
let syncing = false;
let repeatSync = false;
let merging = false;
let socket: WebSocket | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 1000;
const api = hc<Api>('/');
const tabChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('dump-v1');

function rebuild() {
  const dumps = Object.values(store.getTable('dumps')).map((row) => decodeDump(row.data));
  dumps.sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
  const lists = new Map(DEFAULT_LISTS.map((list) => [list.id, list]));
  for (const row of Object.values(store.getTable('lists'))) {
    const list = decodeCollection(row.data); lists.set(list.id, list);
  }
  emit({ dumps, lists: [...lists.values()].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)) });
}

export function initializeStore(): Promise<void> {
  return readyPromise ??= (async () => {
    // TinyBase's first load reports NotFoundError for a brand-new database.
    // Initialize only an empty database; never overwrite an existing one on error.
    const empty = await new Promise<boolean>((resolve, reject) => {
      const request = indexedDB.open('dump-v1');
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other Dump tabs and retry.'));
      request.onsuccess = () => {
        const isEmpty = request.result.objectStoreNames.length === 0;
        request.result.close(); resolve(isEmpty);
      };
    });
    if (empty) await persister.save();
    await persister.load();
    if (persistenceFailure) throw new Error('Your local storage could not be opened. Try reopening this browser.');
    rebuild();
    await persister.startAutoSave();
    if (persistenceFailure) throw new Error('Local storage is unavailable. Enable browser storage and retry.');
    persister.addStatusListener((_persister, status) => emit({ saving: status === 2 }));
    store.addDidFinishTransactionListener(() => {
      rebuild();
      if (!merging) {
        revision++;
        // Capture ends before serialization, messaging, or network work starts.
        setTimeout(() => {
          tabChannel?.postMessage({ version: SCHEMA_VERSION, content: store.getMergeableContent() });
          void syncNow();
        }, 0);
      }
    });
    if (tabChannel) tabChannel.onmessage = (event) => {
      try {
        merging = true;
        mergeContent(store, validateContent(event.data));
      } catch { /* Ignore messages from incompatible open tabs. */ }
      finally { merging = false; }
      void syncNow();
    };
    emit({ ready: true });
    // Ask existing tabs for their persisted/in-flight merge state, without replacing it.
    tabChannel?.postMessage({ type: 'hello' });
    if (tabChannel) {
      const receive = tabChannel.onmessage;
      tabChannel.onmessage = (event) => {
        if (event.data?.type === 'hello') tabChannel.postMessage({ version: SCHEMA_VERSION, content: store.getMergeableContent() });
        else receive?.call(tabChannel, event);
      };
    }
    window.addEventListener('online', () => { retryDelay = 1000; connectEvents(); void syncNow(); });
    window.addEventListener('offline', () => { socket?.close(); emit({ sync: 'offline' }); });
    window.addEventListener('pagehide', () => { void persister.save(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { connectEvents(); void syncNow(); }
      else void persister.save();
    });
    // HTTP polling is the fallback if WebSockets are blocked or unavailable.
    setInterval(() => { if (document.visibilityState === 'visible') void syncNow(); }, 15_000);
    void api.api.ping.$get({}).then(async (response) => {
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        emit({ localServer: (await response.json()).mode === 'local' });
      }
    }).catch(() => {});
    connectEvents();
    void syncNow();
  })();
}

function connectEvents() {
  if (!navigator.onLine || (socket && socket.readyState < WebSocket.CLOSING)) return;
  clearTimeout(reconnectTimer);
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/events`);
  socket.onopen = () => { retryDelay = 1000; };
  socket.onmessage = (event) => {
    try { if (JSON.parse(event.data).type === 'changed') void syncNow(); } catch { /* Ignore SDK control messages. */ }
  };
  socket.onclose = () => {
    reconnectTimer = setTimeout(connectEvents, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30_000);
  };
}

export async function syncNow() {
  if (!snapshot.ready) return;
  if (!navigator.onLine) { emit({ sync: 'offline' }); return; }
  if (syncing) { repeatSync = true; return; }
  syncing = true;
  const sentRevision = revision;
  emit({ sync: 'syncing', syncError: null });
  try {
    const body = JSON.stringify({ version: SCHEMA_VERSION, content: store.getMergeableContent() });
    if (new Blob([body]).size > MAX_SYNC_BYTES) throw new Error('Sync size limit reached. Export your data for safekeeping.');
    const response = await fetch('/api/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      redirect: 'error', signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(response.status === 413 ? 'Sync size limit reached. Export your data for safekeeping.' : 'Sync is unavailable. Your changes will retry automatically.');
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Sync returned an unexpected response. Your changes will retry automatically.');
    const content = validateContent(await response.json());
    merging = true;
    try { mergeContent(store, content); } finally { merging = false; }
    // Incoming server state must also be locally durable before reporting success.
    persistenceFailure = undefined;
    await persister.save();
    if (persistenceFailure) throw new Error('Could not save the latest changes on this device.');
    emit({ sync: sentRevision === revision ? 'synced' : 'syncing' });
  } catch (error) {
    emit({ sync: navigator.onLine ? 'error' : 'offline', syncError: error instanceof Error ? error.message : 'Sync will retry automatically.' });
  } finally {
    syncing = false;
    const retry = repeatSync || sentRevision !== revision;
    repeatSync = false;
    if (retry) setTimeout(() => { void syncNow(); }, 150);
  }
}

export function capture(raw: string) {
  if (!snapshot.ready) throw new Error('Still opening your notebook.');
  const dump = makeDump(raw, crypto.randomUUID(), Date.now(), snapshot.lists);
  store.setRow('dumps', dump.id, { data: encodeDump(dump) });
  return dump;
}

export function updateDump(id: string, changes: Partial<Pick<Dump, 'list' | 'done' | 'deleted' | 'classified_by'>>) {
  const previous = decodeDump(store.getCell('dumps', id, 'data'));
  store.setCell('dumps', id, 'data', encodeDump({ ...previous, ...changes, updated_at: Date.now() }));
  return previous;
}

export function restoreAction(previous: Dump, changes: Parameters<typeof updateDump>[1]) {
  // Undo only fields changed by this action, preserving subsequent unrelated edits.
  const restore: Parameters<typeof updateDump>[1] = {};
  if ('list' in changes) restore.list = previous.list;
  if ('done' in changes) restore.done = previous.done;
  if ('deleted' in changes) restore.deleted = previous.deleted;
  if ('classified_by' in changes) restore.classified_by = previous.classified_by;
  updateDump(previous.id, restore);
}

export function saveList(label: string, color: string, id?: string) {
  if (!snapshot.ready) throw new Error('Still opening your notebook.');
  const existing = snapshot.lists.find((list) => list.id === id);
  if (snapshot.lists.some((list) => !list.deleted && list.id !== id && list.label.toLowerCase() === label.trim().toLowerCase())) throw new Error('A list with that name already exists.');
  if (!existing && snapshot.lists.length >= 500) throw new Error('Your space has reached its list limit.');
  const list = collectionSchema.parse({ id: existing?.id ?? crypto.randomUUID(), label, color, position: existing?.position ?? Math.max(0, ...snapshot.lists.map((item) => item.position)) + 1, deleted: false });
  store.setRow('lists', list.id, { data: encodeCollection(list) });
  return list;
}

export function moveList(id: string, destination: number) {
  const lists = snapshot.lists.filter((list) => !list.deleted);
  const current = lists.find((list) => list.id === id);
  if (!current) return;
  const others = lists.filter((list) => list.id !== id);
  const index = Math.max(0, Math.min(destination, others.length));
  const before = others[index - 1]?.position;
  const after = others[index]?.position;
  const position = before === undefined ? (after ?? 0) - 1 : after === undefined ? before + 1 : (before + after) / 2;
  store.setRow('lists', id, { data: encodeCollection({ ...current, position }) });
}

export function exportDumps() {
  const blob = new Blob([JSON.stringify({ app: 'dump', version: SCHEMA_VERSION, exported_at: new Date().toISOString(), dumps: snapshot.dumps, lists: snapshot.lists }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `dump-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// Additive restore: preserves IDs, never overwrites newer or existing records.
export function importDumps(input: unknown): number {
  const backup = exportSchema.parse(input);
  let added = 0;
  store.transaction(() => {
    for (const list of backup.lists ?? []) {
      if (!store.hasRow('lists', list.id)) store.setRow('lists', list.id, { data: encodeCollection(list) });
    }
    for (const dump of backup.dumps) {
      if (!store.hasRow('dumps', dump.id)) {
        store.setRow('dumps', dump.id, { data: encodeDump(dump) }); added++;
      }
    }
  });
  return added;
}
