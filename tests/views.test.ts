import { describe, expect, it } from 'vite-plus/test';
import type { Snapshot } from '../src/core/client';
import { DEFAULT_LISTS, makeDump, type Dump } from '../src/shared/schema';
import { isOverdue } from '../src/shared/due';
import {
  byDay,
  dayLabel,
  dueLabel,
  dumpsIn,
  home,
  linkHost,
  needsAttention,
  notebook,
  search,
  timeLabel,
} from '../src/core/views';
import { homeRows, placeTitle, rows } from '../mobile/src/views';

const day = (date: string, hour: number) =>
  new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime();

function snapshot(dumps: Dump[]): Snapshot {
  return {
    ready: true,
    dumps: [...dumps].sort((a, b) => b.created_at - a.created_at),
    lists: DEFAULT_LISTS,
    saving: false,
    storageError: null,
    sync: 'local',
    localServer: false,
    syncError: null,
    sorting: new Set(),
  };
}

describe('notebook views', () => {
  it('orders rows for an inverted list: newest first, each day heading after its dumps', () => {
    const now = day('2026-10-04', 18);
    const book = notebook(
      snapshot([
        makeDump('older', crypto.randomUUID(), day('2026-10-03', 9)),
        makeDump('morning', crypto.randomUUID(), day('2026-10-04', 9)),
        makeDump('evening', crypto.randomUUID(), day('2026-10-04', 17)),
      ]),
    );
    const labels = rows(dumpsIn({ kind: 'home' }, book), now).map((row) =>
      row.type === 'day' ? row.label : row.type === 'dump' ? row.dump.text : row.type,
    );
    expect(labels).toEqual(['evening', 'morning', 'Today', 'older', 'Yesterday']);
  });

  it('leaves out removed dumps and finds every word across text, tags and list', () => {
    const lamp = makeDump('!buy warm floor lamp #reading');
    const removed = { ...makeDump('!buy lamp shade'), deleted: true };
    const book = notebook(snapshot([lamp, removed, makeDump('call mum')]));
    expect(search('Lamp BUY', book).map((dump) => dump.id)).toEqual([lamp.id]);
    expect(search('#reading', book).map((dump) => dump.id)).toEqual([lamp.id]);
    expect(dumpsIn({ kind: 'list', id: 'buy' }, book)).toEqual([lamp]);
  });

  it('ends home in Today, read bottom up: today’s sections, then older days, then Done', () => {
    const now = day('2026-10-17', 18);
    const make = (text: string, created: number, due: string | null = null) =>
      makeDump(text, crypto.randomUUID(), created, DEFAULT_LISTS, null, due);
    const finished = { ...make('finished', day('2026-10-15', 9)), done: true };
    const book = notebook(
      snapshot([
        make('older', day('2026-10-16', 9)),
        make('late', day('2026-10-10', 9), '2026-10-15'),
        make('friday', day('2026-10-12', 9), '2026-10-23'),
        make('just now', day('2026-10-17', 17)),
        finished,
      ]),
    );
    const labels = homeRows(book, now).map((row) =>
      row.type === 'dump' ? row.dump.text : row.type === 'day' ? row.label : row.type,
    );
    expect(labels).toEqual([
      'just now',
      'Dumped today',
      'friday',
      'Coming up',
      'late',
      'Overdue',
      'today',
      'older',
      'Yesterday',
      'done',
    ]);
  });

  it('marks an empty Today as quiet, and gives its summary only the date', () => {
    const now = day('2026-10-17', 18);
    const book = notebook(snapshot([makeDump('older', crypto.randomUUID(), day('2026-10-16', 9))]));
    const rows = homeRows(book, now);
    expect(rows.map((row) => (row.type === 'dump' ? row.dump.text : row.type))).toEqual([
      'quiet',
      'today',
      'older',
      'day',
    ]);
    const today = rows.find((row) => row.type === 'today');
    expect(today?.type === 'today' && today.summary).not.toContain('due today');
  });

  it('names each view, and shows home for a list that no longer exists', () => {
    const book = notebook(snapshot([]));
    expect(placeTitle({ kind: 'home' }, book)).toBe('Home');
    expect(placeTitle({ kind: 'done' }, book)).toBe('Done');
    expect(placeTitle({ kind: 'list', id: 'ideas' }, book)).toBe('Ideas');
    expect(placeTitle({ kind: 'list', id: 'gone' }, book)).toBe('Home');
  });

  it('marks an open dump overdue only after its day', () => {
    const now = day('2026-10-17', 9);
    const due = (date: string) =>
      makeDump('pay rent', crypto.randomUUID(), now, DEFAULT_LISTS, null, date);
    expect(isOverdue(due('2026-10-16'), now)).toBe(true);
    expect(isOverdue(due('2026-10-17'), now)).toBe(false);
    expect(isOverdue({ ...due('2026-10-16'), done: true }, now)).toBe(false);
  });

  it('names a due day from today: Today, Tomorrow, a weekday this week, else a date', () => {
    const now = day('2026-10-17', 9);
    expect(dueLabel('2026-10-17', now)).toBe('Today');
    expect(dueLabel('2026-10-18', now)).toBe('Tomorrow');
    expect(dueLabel('2026-10-16', now)).toBe('Yesterday');
    expect(dueLabel('2026-10-23', now)).toBe(
      new Date(2026, 9, 23).toLocaleDateString(undefined, { weekday: 'long' }),
    );
    expect(dueLabel('2027-01-05', now)).toContain('2027');
  });

  it('gives Today a summary on every client, and leaves Jev’s work out of Sort inbox', () => {
    const now = day('2026-10-17', 18);
    const make = (text: string, due: string | null) =>
      makeDump(text, crypto.randomUUID(), day('2026-10-17', 9), DEFAULT_LISTS, null, due);
    const sorting = make('being sorted', null);
    const state = {
      ...snapshot([make('late', '2026-10-15'), sorting]),
      sorting: new Set([sorting.id]),
    };
    const book = notebook(state);
    const plan = home(book, now);
    expect(plan.sections.map((section) => section.label)).toEqual(['Overdue', 'Dumped today']);
    expect(plan.heading).toMatch(/ · 1 overdue · Nothing due today$/);
    const quiet = home(notebook(snapshot([])), now);
    expect(quiet.quiet).toBe(true);
    expect(quiet.heading).not.toContain('due today');
    expect(book.unfiled.map((dump) => dump.text)).toEqual(['late']);
  });

  it('needs attention when this device cannot save or sync is offline, paused or signed out', () => {
    const base = snapshot([]);
    expect(needsAttention(base)).toBe(false);
    expect(needsAttention({ ...base, sync: 'synced' })).toBe(false);
    expect(needsAttention({ ...base, storageError: 'Disk full' })).toBe(true);
    for (const sync of ['offline', 'error', 'signed-out'] as const)
      expect(needsAttention({ ...base, sync })).toBe(true);
  });

  it('names capture days and times, and groups dumps by the day they were captured', () => {
    const now = day('2026-10-17', 18);
    expect(dayLabel('2026-10-17', now)).toBe('Today');
    expect(dayLabel('2026-10-16', now)).toBe('Yesterday');
    expect(dayLabel('2025-10-16', now)).toContain('2025');
    expect(timeLabel(now - 30_000, now)).toBe('now');
    expect(timeLabel(now - 5 * 60_000, now)).toBe('5m');
    expect(timeLabel(now - 3 * 3_600_000, now)).toBe('3h');
    expect(timeLabel(day('2026-10-16', 9), now)).toBe(
      new Date(day('2026-10-16', 9)).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }),
    );
    expect(linkHost('https://www.example.com/a')).toBe('example.com');
    const make = (text: string, created: number) => makeDump(text, crypto.randomUUID(), created);
    const groups = byDay([
      make('a', day('2026-10-16', 9)),
      make('b', day('2026-10-16', 20)),
      make('c', day('2026-10-17', 9)),
    ]);
    expect(groups.map((group) => [group.day, group.dumps.map((dump) => dump.text)])).toEqual([
      ['2026-10-16', ['a', 'b']],
      ['2026-10-17', ['c']],
    ]);
  });
});
