import type { Snapshot } from '../../src/core/client';
import type { Collection, Dump } from '../../src/shared/schema';

// The notebook's views, as on the web and the Mac: every open dump, one list's open dumps, or
// the finished ones.
export type Place = { kind: 'inbox' } | { kind: 'list'; id: string } | { kind: 'done' };

// What the screens show: dumps (newest first) and lists, without tombstones.
export type Notebook = {
  dumps: Dump[];
  lists: Collection[];
  open: Dump[];
  done: Dump[];
  sorting: ReadonlySet<string>;
  list(id: string | null): Collection | undefined;
};

const notebooks = new WeakMap<Snapshot, Notebook>();

export function notebook(snapshot: Snapshot): Notebook {
  const cached = notebooks.get(snapshot);
  if (cached) return cached;
  const dumps = snapshot.dumps.filter((dump) => !dump.deleted);
  const lists = snapshot.lists.filter((list) => !list.deleted);
  const byId = new Map(lists.map((list) => [list.id, list]));
  const result: Notebook = {
    dumps,
    lists,
    open: dumps.filter((dump) => !dump.done),
    done: dumps.filter((dump) => dump.done),
    sorting: snapshot.sorting,
    list: (id) => (id === null ? undefined : byId.get(id)),
  };
  notebooks.set(snapshot, result);
  return result;
}

// A view's dumps, newest first. A list that is gone shows nothing; its screen leaves for Home.
export function dumpsIn(place: Place, notebook: Notebook) {
  if (place.kind === 'inbox') return notebook.open;
  if (place.kind === 'done') return notebook.done;
  return notebook.open.filter((dump) => dump.list === place.id);
}

export function placeTitle(place: Place, notebook: Notebook) {
  if (place.kind === 'inbox') return 'Inbox';
  if (place.kind === 'done') return 'Done';
  return notebook.list(place.id)?.label ?? 'Inbox';
}

export const placeOf = (dump: Dump): Place =>
  dump.done ? { kind: 'done' } : dump.list ? { kind: 'list', id: dump.list } : { kind: 'inbox' };

// Open dumps with no list that Jev isn't sorting: what Sort inbox walks through.
export const unfiled = (notebook: Notebook) =>
  notebook.open.filter((dump) => dump.list === null && !notebook.sorting.has(dump.id));

// Dumps whose text, tags or list contain every word of the query, newest first.
export function search(query: string, notebook: Notebook) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return notebook.dumps.filter((dump) => {
    const list = notebook.list(dump.list)?.label ?? 'Inbox';
    const haystack = fold([dump.text, list, ...dump.tags.map((tag) => `#${tag}`)].join(' '));
    return words.every((word) => haystack.includes(word));
  });
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

// Rows for an inverted list, which draws its first row at the bottom: newest dump first, and each
// day's heading after its dumps so that it shows above them.
export type Row =
  | { type: 'day'; key: string; label: string }
  | { type: 'dump'; key: string; dump: Dump };

export function rows(dumps: Dump[], now = new Date()): Row[] {
  const result: Row[] = [];
  let day: Date | undefined;
  for (const dump of dumps) {
    const start = startOfDay(new Date(dump.created_at));
    if (day && start.getTime() !== day.getTime()) result.push(heading(day, now));
    day = start;
    result.push({ type: 'dump', key: dump.id, dump });
  }
  if (day) result.push(heading(day, now));
  return result;
}

const heading = (day: Date, now: Date): Row => ({
  type: 'day',
  key: `day-${day.getTime()}`,
  label: dayLabel(day, now),
});

function startOfDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function dayLabel(day: Date, now = new Date()) {
  const today = startOfDay(now);
  const days = Math.round((today.getTime() - startOfDay(day).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return day.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: day.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

// Rows sit under a day heading, so today's show a short age and older ones their time.
export function timeLabel(created: number, now = new Date()) {
  const date = new Date(created);
  if (startOfDay(date).getTime() !== startOfDay(now).getTime())
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const minutes = Math.floor(Math.max(0, now.getTime() - created) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

export function host(url: string) {
  try {
    const { hostname } = new URL(url);
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  } catch {
    return url;
  }
}

// `!list` names a list by its label with hyphens for spaces (listPrefix in src/shared/schema.ts).
export const prefixFor = (list: Collection) =>
  `!${list.label.toLowerCase().split(/\s+/).join('-')}`;
