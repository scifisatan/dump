import { agenda, dayKey, dayFromKey, startOfDay } from '../shared/due';
import type { Collection, Dump } from '../shared/schema';
import type { Snapshot } from './client';

export type Place = { kind: 'home' } | { kind: 'list'; id: string } | { kind: 'done' };

export type Notebook = {
  dumps: Dump[];
  lists: Collection[];
  open: Dump[];
  done: Dump[];
  unfiled: Dump[];
  sorting: ReadonlySet<string>;
  list(id: string | null): Collection | undefined;
  listLabel(id: string | null): string;
};

// Snapshots never change once made, so each one's notebook is worked out once.
const notebooks = new WeakMap<Snapshot, Notebook>();

export function notebook(snapshot: Snapshot): Notebook {
  const cached = notebooks.get(snapshot);
  if (cached) return cached;
  const dumps = snapshot.dumps.filter((dump) => !dump.deleted);
  const lists = snapshot.lists.filter((list) => !list.deleted);
  const byId = new Map(lists.map((list) => [list.id, list]));
  const open = dumps.filter((dump) => !dump.done);
  const list = (id: string | null) => (id === null ? undefined : byId.get(id));
  const result: Notebook = {
    dumps,
    lists,
    open,
    done: dumps.filter((dump) => dump.done),
    unfiled: open.filter((dump) => dump.list === null && !snapshot.sorting.has(dump.id)),
    sorting: snapshot.sorting,
    list,
    listLabel: (id) => list(id)?.label ?? 'Inbox',
  };
  notebooks.set(snapshot, result);
  return result;
}

export function dumpsIn(place: Place, notebook: Notebook) {
  if (place.kind === 'home') return notebook.open;
  if (place.kind === 'done') return notebook.done;
  return notebook.open.filter((dump) => dump.list === place.id);
}

export const placeOf = (dump: Dump): Place =>
  dump.done ? { kind: 'done' } : dump.list ? { kind: 'list', id: dump.list } : { kind: 'home' };

export const needsAttention = (snapshot: Pick<Snapshot, 'storageError' | 'sync'>) =>
  snapshot.storageError !== null ||
  snapshot.sync === 'offline' ||
  snapshot.sync === 'error' ||
  snapshot.sync === 'signed-out';

const TODAY = [
  ['overdue', 'Overdue'],
  ['due', 'Due today'],
  ['upcoming', 'Coming up'],
  ['dumped', 'Dumped today'],
] as const;

export function home(notebook: Notebook, now: number) {
  const plan = agenda(notebook.open, now);
  const sections = TODAY.map(([key, label]) => ({
    key,
    label,
    overdue: key === 'overdue',
    dumps: plan[key],
  })).filter((section) => section.dumps.length > 0);
  const quiet = sections.length === 0;
  const overdue = plan.overdue.length > 0 ? `${plan.overdue.length} overdue · ` : '';
  const date = longDate(now);
  return {
    earlier: plan.earlier,
    sections,
    quiet,
    heading: quiet ? date : `${date} · ${overdue}${plan.due.length || 'Nothing'} due today`,
  };
}

export function byDay(dumps: Dump[]) {
  const days: { day: string; dumps: Dump[] }[] = [];
  for (const dump of dumps) {
    const day = dayKey(dump.created_at);
    const last = days.at(-1);
    if (last?.day === day) last.dumps.push(dump);
    else days.push({ day, dumps: [dump] });
  }
  return days;
}

export const DAY_EXAMPLES = [
  'Call the bank tomorrow',
  'Pay rent by friday',
  'Book the dentist in 3 days',
];

const daysFrom = (now: number, date: Date) =>
  Math.round((date.getTime() - startOfDay(now).getTime()) / 86_400_000);
const sameYear = (date: Date, now: number) => date.getFullYear() === new Date(now).getFullYear();

export const longDate = (now: number) =>
  new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

export function dayLabel(day: string, now: number) {
  const date = dayFromKey(day);
  const ahead = daysFrom(now, date);
  if (ahead === 0) return 'Today';
  if (ahead === -1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: sameYear(date, now) ? undefined : 'numeric',
  });
}

export function dueLabel(due: string, now: number) {
  const date = dayFromKey(due);
  const ahead = daysFrom(now, date);
  if (ahead === 0) return 'Today';
  if (ahead === 1) return 'Tomorrow';
  if (ahead === -1) return 'Yesterday';
  if (ahead > 1 && ahead < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(
    undefined,
    sameYear(date, now)
      ? { weekday: 'short', month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' },
  );
}

export function timeLabel(created: number, now: number) {
  if (dayKey(created) !== dayKey(now))
    return new Date(created).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const minutes = Math.floor(Math.max(0, now - created) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

export function linkHost(url: string) {
  try {
    const { hostname } = new URL(url);
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  } catch {
    return url;
  }
}

export const searchText = (dump: Dump, notebook: Notebook) =>
  [dump.text, notebook.listLabel(dump.list), ...dump.tags.map((tag) => `#${tag}`)].join(' ');

/** Lower case without accents, as `search` compares text. */
export const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

export function search(query: string, notebook: Notebook) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return notebook.dumps.filter((dump) => {
    const haystack = fold(searchText(dump, notebook));
    return words.every((word) => haystack.includes(word));
  });
}
