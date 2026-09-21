import { describe, expect, it } from 'vitest';
import { DEFAULT_LISTS, decodeCollection, decodeDump, encodeCollection, encodeDump, exportSchema, makeDump, SCHEMA_VERSION } from '../src/shared/schema';
import { mergeContent, newStore, validateContent } from '../src/shared/merge';

describe('capture parser', () => {
  it('files explicit prefixes and retains the original thought and hashtags', () => {
    const dump = makeDump('  !buy warm floor lamp #Reading #reading  ');
    expect(dump.list).toBe('buy');
    expect(dump.text).toBe('warm floor lamp #Reading #reading');
    expect(dump.tags).toEqual(['reading']);
    expect(dump.classified_by).toBe('user');
  });
  it('does not eat unknown prefixes or confuse URL fragments with tags', () => {
    const dump = makeDump('!unknown https://example.com/page#section #later');
    expect(dump.list).toBeNull();
    expect(dump.text).toContain('!unknown');
    expect(dump.tags).toEqual(['later']);
    expect(dump.url).toBe('https://example.com/page#section');
  });
  it('rejects empty and overly long captures', () => {
    expect(() => makeDump('  ')).toThrow();
    expect(() => makeDump('!buy ')).toThrow();
    expect(() => makeDump('a'.repeat(20_001))).toThrow();
  });
});

describe('synced custom lists and version migration', () => {
  it('files into a custom list and keeps its stable identity across a rename', () => {
    const list = { id: crypto.randomUUID(), label: 'Weekend plans', color: '#849c74', position: 6, deleted: false };
    const dump = makeDump('!weekend-plans go for a walk', crypto.randomUUID(), 100, [...DEFAULT_LISTS, list]);
    expect(dump.list).toBe(list.id);
    expect(dump.text).toBe('go for a walk');
    expect(decodeCollection(encodeCollection({ ...list, label: 'Outdoors' })).id).toBe(dump.list);
  });
  it('adds list metadata without rewriting legacy dump cells or their clocks', () => {
    const legacy = newStore(); const dump = makeDump('already saved');
    legacy.setRow('dumps', dump.id, { data: encodeDump(dump) });
    const legacyContent = legacy.getMergeableContent();
    const upgraded = newStore().setMergeableContent(validateContent({ version: 1, content: legacyContent }));
    upgraded.setRow('lists', 'ideas', { data: encodeCollection({ ...DEFAULT_LISTS[0], label: 'Sparks', position: -1 }) });
    expect(upgraded.getMergeableContent()[0][0].dumps).toEqual(legacyContent[0][0].dumps);
    const restored = newStore().setMergeableContent(validateContent({ version: SCHEMA_VERSION, content: JSON.parse(JSON.stringify(upgraded.getMergeableContent())) }));
    expect(restored.getMergeableContent()).toEqual(upgraded.getMergeableContent());
    expect(decodeCollection(restored.getCell('lists', 'ideas', 'data')).label).toBe('Sparks');
  });
  it('merges independent list and dump changes across devices', () => {
    const phone = newStore(); const desktop = newStore(); const dump = makeDump('a new thought');
    phone.setRow('dumps', dump.id, { data: encodeDump(dump) });
    desktop.setRow('lists', 'buy', { data: encodeCollection({ ...DEFAULT_LISTS[1], position: -2 }) });
    mergeContent(phone, validateContent({ version: SCHEMA_VERSION, content: desktop.getMergeableContent() }));
    mergeContent(desktop, phone.getMergeableContent());
    expect(phone.getTables()).toEqual(desktop.getTables());
    expect(phone.getRowCount('dumps')).toBe(1);
    expect(decodeCollection(phone.getCell('lists', 'buy', 'data')).position).toBe(-2);
  });
  it('accepts legacy backups and rejects invalid list records before merging', () => {
    expect(exportSchema.parse({ app: 'dump', version: 1, exported_at: '', dumps: [makeDump('legacy')] }).dumps).toHaveLength(1);
    const store = newStore();
    store.setRow('lists', 'buy', { data: encodeCollection(DEFAULT_LISTS[0]) });
    expect(() => validateContent({ version: SCHEMA_VERSION, content: store.getMergeableContent() })).toThrow('List ID mismatch');
  });
});

describe('TinyBase merge contract', () => {
  it('converges concurrent offline captures without duplicates', () => {
    const phone = newStore(); const desktop = newStore(); const server = newStore();
    const a = makeDump('phone thought'); const b = makeDump('desktop thought');
    phone.setRow('dumps', a.id, { data: encodeDump(a) });
    desktop.setRow('dumps', b.id, { data: encodeDump(b) });
    for (const peer of [phone, desktop, phone, desktop]) mergeContent(server, validateContent({ version: 1, content: peer.getMergeableContent() }));
    mergeContent(phone, server.getMergeableContent()); mergeContent(desktop, server.getMergeableContent());
    expect(phone.getTables()).toEqual(desktop.getTables());
    expect(server.getRowCount('dumps')).toBe(2);
  });
  it('keeps a deletion tombstone when a stale device reconnects, then supports undo', () => {
    const phone = newStore(); const desktop = newStore();
    const dump = makeDump('something to remove');
    phone.setRow('dumps', dump.id, { data: encodeDump(dump) });
    mergeContent(desktop, phone.getMergeableContent());
    phone.setCell('dumps', dump.id, 'data', encodeDump({ ...dump, deleted: true }));
    mergeContent(phone, desktop.getMergeableContent());
    expect(decodeDump(phone.getCell('dumps', dump.id, 'data')).deleted).toBe(true);
    mergeContent(desktop, phone.getMergeableContent());
    desktop.setCell('dumps', dump.id, 'data', encodeDump(dump));
    mergeContent(phone, desktop.getMergeableContent());
    expect(decodeDump(phone.getCell('dumps', dump.id, 'data')).deleted).toBe(false);
  });
  it('restores merge metadata across server restarts and keeps filing atomic', () => {
    const a = newStore(); const b = newStore(); const dump = makeDump('a chair');
    a.setRow('dumps', dump.id, { data: encodeDump(dump) }); mergeContent(b, a.getMergeableContent());
    a.setCell('dumps', dump.id, 'data', encodeDump({ ...dump, list: 'buy', classified_by: 'user' }));
    b.setCell('dumps', dump.id, 'data', encodeDump({ ...dump, list: 'decor', classified_by: 'ai' }));
    mergeContent(a, b.getMergeableContent()); mergeContent(b, a.getMergeableContent());
    const restarted = newStore().setMergeableContent(JSON.parse(JSON.stringify(a.getMergeableContent())));
    expect(restarted.getTables()).toEqual(b.getTables());
    const result = decodeDump(restarted.getCell('dumps', dump.id, 'data'));
    expect([[ 'buy', 'user' ], [ 'decor', 'ai' ]]).toContainEqual([result.list, result.classified_by]);
  });
  it('rejects malformed payloads and mismatched IDs before merging', () => {
    const store = newStore(); const dump = makeDump('hello');
    store.setRow('dumps', crypto.randomUUID(), { data: encodeDump(dump) });
    expect(() => validateContent({ version: 1, content: store.getMergeableContent() })).toThrow('ID mismatch');
    expect(() => validateContent({ version: 2, content: [] })).toThrow();
    expect(() => validateContent({ version: 1, content: [[{}, '', -1], [{}, '', 0]] })).toThrow();
  });
});
