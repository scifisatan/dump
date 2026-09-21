import { createMergeableStore, type MergeableStore } from 'tinybase';
import {
  DEFAULT_LISTS,
  decodeCollection,
  decodeDump,
  type Collection,
  type Dump,
  storeSchema,
} from './schema';

// The table schema only admits a string `data` cell per row; TinyBase drops anything else.
// Tombstones are ordinary records with deleted=true; we never delRow().
export const newStore = () => createMergeableStore().setTablesSchema(storeSchema);

// Sync runs over TinyBase's WebSocket synchronizer, which relays peers' rows without
// inspecting them. Every device decodes rows when reading and skips any it cannot trust.
export function readRows(store: MergeableStore) {
  const dumps: Dump[] = [];
  for (const [id, row] of Object.entries(store.getTable('dumps'))) {
    const dump = tryDecode(() => decodeDump(row.data));
    if (dump?.id === id) dumps.push(dump);
  }
  dumps.sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
  const lists = new Map(DEFAULT_LISTS.map((list) => [list.id, list]));
  for (const [id, row] of Object.entries(store.getTable('lists'))) {
    const list = tryDecode(() => decodeCollection(row.data));
    if (list?.id === id) lists.set(id, list);
  }
  return {
    dumps,
    lists: [...lists.values()].sort(
      (a: Collection, b: Collection) => a.position - b.position || a.id.localeCompare(b.id),
    ),
  };
}

function tryDecode<T>(decode: () => T): T | undefined {
  try {
    return decode();
  } catch {
    return undefined;
  }
}

// Large first syncs are split into fragments and given time to arrive on slow connections.
export const SYNC_FRAGMENT_BYTES = 256 * 1024;
export const SYNC_TIMEOUT_SECONDS = 10;
