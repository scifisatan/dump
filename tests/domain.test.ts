import { describe, expect, it } from 'vite-plus/test';
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
import { agenda, parseDue } from '../src/shared/due';
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
  it('files into the chosen list unless a prefix names another or the list is gone', () => {
    const make = (raw: string, chosen: string) =>
      makeDump(raw, crypto.randomUUID(), 100, DEFAULT_LISTS, chosen);
    expect(make('warm floor lamp', 'decor')).toMatchObject({
      list: 'decor',
      text: 'warm floor lamp',
      classified_by: 'user',
    });
    expect(make('!buy warm floor lamp', 'decor').list).toBe('buy');
    const lists = DEFAULT_LISTS.map((list) => ({ ...list, deleted: list.id === 'decor' }));
    expect(makeDump('warm floor lamp', crypto.randomUUID(), 100, lists, 'decor')).toMatchObject({
      list: null,
      classified_by: null,
    });
  });
  it('rejects empty and overly long captures', () => {
    expect(() => makeDump('  ')).toThrow();
    expect(() => makeDump('!buy ')).toThrow();
    expect(() => makeDump('a'.repeat(20_001))).toThrow();
  });
});

describe('due days', () => {
  // Saturday, October 17, 2026, in this machine's time zone.
  const now = new Date(2026, 9, 17, 9, 30).getTime();
  it('reads the day a capture names, relative to when it was captured', () => {
    const cases: [string, string | null][] = [
      ['call the bank today', '2026-10-17'],
      ['dentist tomorrow', '2026-10-18'],
      ['the day after tomorrow, pick up the suit', '2026-10-19'],
      ['submit my application by friday', '2026-10-23'],
      ['saturday market', '2026-10-17'],
      ['next saturday', '2026-10-24'],
      ['next monday standup', '2026-10-19'],
      ['next friday', '2026-10-23'],
      ['pay rent by fri', '2026-10-23'],
      ['in 3 days', '2026-10-20'],
      ['in a week', '2026-10-24'],
      ['in 2 weeks', '2026-10-31'],
      ['oct 24 concert', '2026-10-24'],
      ['24th october', '2026-10-24'],
      ['dec 25, 2027', '2027-12-25'],
      ['renew passport sept 3', '2027-09-03'],
      ['on the 24th', '2026-10-24'],
      ['by the 5th', '2026-11-05'],
      ['tax return 2026-01-05', '2026-01-05'],
      ['tomorrow, then friday', '2026-10-18'],
    ];
    for (const [text, due] of cases) expect([text, parseDue(text, now)]).toEqual([text, due]);
  });
  it('leaves ordinary words, impossible days and dates inside links alone', () => {
    for (const text of [
      'sat down to write',
      'the sun is out',
      'it may be later',
      'feb 30',
      'mark 5 as read',
      'https://example.com/2026-10-30/post',
    ])
      expect([text, parseDue(text, now)]).toEqual([text, null]);
  });
  it('splits home into earlier dumps, then overdue, due today, coming up and dumped today', () => {
    const make = (text: string, created: Date, due: string | null = null) =>
      makeDump(text, crypto.randomUUID(), created.getTime(), DEFAULT_LISTS, null, due);
    const dumps = [
      make('dumped later', new Date(2026, 9, 17, 9)),
      make('dumped first', new Date(2026, 9, 17, 8)),
      make('late', new Date(2026, 9, 10), '2026-10-15'),
      make('next week', new Date(2026, 9, 12), '2026-10-23'),
      make('monday', new Date(2026, 9, 16), '2026-10-19'),
      make('today', new Date(2026, 9, 11), '2026-10-17'),
      make('yesterday', new Date(2026, 9, 16, 20)),
      make('last week', new Date(2026, 9, 9)),
    ];
    const texts = (part: typeof dumps) => part.map((dump) => dump.text);
    const plan = agenda(dumps, now);
    expect(texts(plan.earlier)).toEqual(['last week', 'yesterday']);
    expect(texts(plan.overdue)).toEqual(['late']);
    expect(texts(plan.due)).toEqual(['today']);
    expect(texts(plan.upcoming)).toEqual(['monday', 'next week']);
    expect(texts(plan.dumped)).toEqual(['dumped first', 'dumped later']);
  });
  it('records the day at capture, unless the owner settled on another or none', () => {
    const make = (due?: string | null) =>
      makeDump('submit by friday', crypto.randomUUID(), now, DEFAULT_LISTS, null, due);
    expect(make().due).toBe('2026-10-23');
    expect(make('2026-10-30').due).toBe('2026-10-30');
    expect(make(null).due).toBeNull();
    expect(() => make('friday')).toThrow();
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
  it('reads a dump saved before days existed as undated, and writes its day on the next edit', () => {
    const store = newStore();
    const { due: _, ...old } = makeDump('an old thought');
    store.setRow('dumps', old.id, { data: JSON.stringify(old) });
    const [dump] = readRows(store).dumps;
    expect(dump).toMatchObject({ id: old.id, text: 'an old thought', due: null });
    expect(JSON.parse(encodeDump({ ...dump, done: true }))).toMatchObject({
      due: null,
      done: true,
    });
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
