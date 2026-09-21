import { createMergeableStore, type MergeableContent, type MergeableStore } from 'tinybase';
import { z } from 'zod';
import { decodeCollection, decodeDump, listSchema, SCHEMA_VERSION, storeSchema } from './schema';

const timestamp = z.string().max(64);
const hash = z.number().int().nonnegative().max(0xffffffff);
const cell = z.tuple([z.string().max(130_000), timestamp, hash]);
const row = z.tuple([z.object({ data: cell }).strict(), timestamp, hash]);
const table = z.tuple([z.record(z.uuid(), row), timestamp, hash]);
const listTable = z.tuple([z.record(listSchema, row), timestamp, hash]);
const tables = z.tuple([z.object({ dumps: table.optional(), lists: listTable.optional() }).strict(), timestamp, hash]);
const values = z.tuple([z.object({}).strict(), timestamp, hash]);
export const syncSchema = z.object({
  version: z.union([z.literal(1), z.literal(SCHEMA_VERSION)]),
  content: z.tuple([tables, values]),
}).strict();

export const newStore = () => createMergeableStore().setTablesSchema(storeSchema);

// Validate the transport and every record before touching the authoritative store.
// Tombstones are ordinary records with deleted=true; we never delRow().
export function validateContent(input: unknown): MergeableContent {
  const { content } = syncSchema.parse(input);
  const rows = content[0][0].dumps?.[0] ?? {};
  if (Object.keys(rows).length > 50_000) throw new Error('Too many items.');
  for (const [id, value] of Object.entries(rows)) {
    const dump = decodeDump(value[0].data[0]);
    if (dump.id !== id) throw new Error('Record ID mismatch.');
  }
  const lists = content[0][0].lists?.[0] ?? {};
  if (Object.keys(lists).length > 500) throw new Error('Too many lists.');
  for (const [id, value] of Object.entries(lists)) {
    if (decodeCollection(value[0].data[0]).id !== id) throw new Error('List ID mismatch.');
  }
  // SAFETY: Zod validates TinyBase's complete nested tuple representation above;
  // its timestamp string brand is not expressible in Zod's inferred output.
  return content as MergeableContent;
}

export function mergeContent(store: MergeableStore, content: MergeableContent) {
  const peer = newStore().setMergeableContent(content);
  store.merge(peer);
}

export const MAX_SYNC_BYTES = 4 * 1024 * 1024;
