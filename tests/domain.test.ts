import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LISTS,
  decodeCollection,
  decodeDump,
  encodeCollection,
  encodeDump,
  exportSchema,
  makeDump,
} from '../src/shared/schema';
import type { MergeableContent, MergeableStore } from 'tinybase';
import { newStore, readRows } from '../src/shared/merge';

// What TinyBase's synchronizers do once hashes show a difference.
const mergeContent = (store: MergeableStore, content: MergeableContent) =>
  store.applyMergeableChanges(JSON.parse(JSON.stringify(content)));

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

describe('synced custom lists', () => {
  it('files into a custom list and keeps its stable identity across a rename', () => {
    const list = {
      id: crypto.randomUUID(),
      label: 'Weekend plans',
      color: '#849c74',
      position: 6,
      deleted: false,
    };
    const dump = makeDump('!weekend-plans go for a walk', crypto.randomUUID(), 100, [
      ...DEFAULT_LISTS,
      list,
    ]);
    expect(dump.list).toBe(list.id);
    expect(dump.text).toBe('go for a walk');
    expect(decodeCollection(encodeCollection({ ...list, label: 'Outdoors' })).id).toBe(dump.list);
  });
  it('merges independent list and dump changes across devices', () => {
    const phone = newStore();
    const desktop = newStore();
    const dump = makeDump('a new thought');
    phone.setRow('dumps', dump.id, { data: encodeDump(dump) });
    desktop.setRow('lists', 'buy', {
      data: encodeCollection({ ...DEFAULT_LISTS[1], position: -2 }),
    });
    mergeContent(phone, desktop.getMergeableContent());
    mergeContent(desktop, phone.getMergeableContent());
    expect(phone.getTables()).toEqual(desktop.getTables());
    expect(phone.getRowCount('dumps')).toBe(1);
    expect(decodeCollection(phone.getCell('lists', 'buy', 'data')).position).toBe(-2);
  });
  it('requires lists in backups and ignores lists whose ID does not match', () => {
    expect(() => exportSchema.parse({ app: 'dump', exported_at: '', dumps: [] })).toThrow();
    const store = newStore();
    store.setRow('lists', 'buy', { data: encodeCollection(DEFAULT_LISTS[0]) });
    expect(readRows(store).lists.find((list) => list.id === 'buy')?.label).toBe('Buy');
  });
});

describe('TinyBase merge contract', () => {
  it('converges concurrent offline captures without duplicates', () => {
    const phone = newStore();
    const desktop = newStore();
    const server = newStore();
    const a = makeDump('phone thought');
    const b = makeDump('desktop thought');
    phone.setRow('dumps', a.id, { data: encodeDump(a) });
    desktop.setRow('dumps', b.id, { data: encodeDump(b) });
    for (const peer of [phone, desktop, phone, desktop])
      mergeContent(server, peer.getMergeableContent());
    mergeContent(phone, server.getMergeableContent());
    mergeContent(desktop, server.getMergeableContent());
    expect(phone.getTables()).toEqual(desktop.getTables());
    expect(server.getRowCount('dumps')).toBe(2);
  });
  it('keeps a deletion tombstone when a stale device reconnects, then lets a later edit win', () => {
    const phone = newStore();
    const desktop = newStore();
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
    const a = newStore();
    const b = newStore();
    const dump = makeDump('a chair');
    a.setRow('dumps', dump.id, { data: encodeDump(dump) });
    mergeContent(b, a.getMergeableContent());
    a.setCell(
      'dumps',
      dump.id,
      'data',
      encodeDump({ ...dump, list: 'buy', classified_by: 'user' }),
    );
    b.setCell(
      'dumps',
      dump.id,
      'data',
      encodeDump({ ...dump, list: 'decor', classified_by: 'ai' }),
    );
    mergeContent(a, b.getMergeableContent());
    mergeContent(b, a.getMergeableContent());
    const restarted = newStore().setMergeableContent(
      JSON.parse(JSON.stringify(a.getMergeableContent())),
    );
    expect(restarted.getTables()).toEqual(b.getTables());
    const result = decodeDump(restarted.getCell('dumps', dump.id, 'data'));
    expect([
      ['buy', 'user'],
      ['decor', 'ai'],
    ]).toContainEqual([result.list, result.classified_by]);
  });
  it('skips rows a peer sent that do not decode, instead of failing to open', () => {
    const store = newStore();
    const good = makeDump('a real thought');
    const spoofed = makeDump('wrong id');
    store.setRow('dumps', good.id, { data: encodeDump(good) });
    store.setRow('dumps', crypto.randomUUID(), { data: encodeDump(spoofed) });
    store.setRow('dumps', crypto.randomUUID(), { data: '{"not":"a dump"}' });
    store.setRow('lists', 'broken', { data: 'not json' });
    const rows = readRows(store);
    expect(rows.dumps.map((dump) => dump.id)).toEqual([good.id]);
    expect(rows.lists.map((list) => list.id)).toEqual(DEFAULT_LISTS.map((list) => list.id));
  });
});
