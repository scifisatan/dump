import { describe, expect, it } from 'vite-plus/test';
import type { Snapshot } from '../src/core/client';
import { DEFAULT_LISTS, makeDump, type Dump } from '../src/shared/schema';
import { dueLabel, dumpsIn, homeRows, notebook, rows, search } from '../mobile/src/views';

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

describe('phone app views', () => {
  it('orders rows for an inverted list: newest first, each day heading after its dumps', () => {
    const now = new Date(day('2026-10-04', 18));
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
    const now = new Date(day('2026-10-17', 18));
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
    const now = new Date(day('2026-10-17', 18));
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

  it('names a due day from today: Today, Tomorrow, a weekday this week, else a date', () => {
    const now = new Date(day('2026-10-17', 9));
    expect(dueLabel('2026-10-17', now)).toBe('Today');
    expect(dueLabel('2026-10-18', now)).toBe('Tomorrow');
    expect(dueLabel('2026-10-16', now)).toBe('Yesterday');
    expect(dueLabel('2026-10-23', now)).toBe(
      new Date(2026, 9, 23).toLocaleDateString(undefined, { weekday: 'long' }),
    );
    expect(dueLabel('2027-01-05', now)).toContain('2027');
  });
});
