import { describe, expect, it } from 'vite-plus/test';
import type { Snapshot } from '../src/core/client';
import { DEFAULT_LISTS, makeDump, type Dump } from '../src/shared/schema';
import { dumpsIn, notebook, rows, search } from '../mobile/src/views';

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
    const labels = rows(dumpsIn({ kind: 'inbox' }, book), now).map((row) =>
      row.type === 'day' ? row.label : row.dump.text,
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
});
