import type { Snapshot } from '../src/core/client';
import {
  byDay,
  dayLabel,
  dueLabel,
  dumpsIn,
  home,
  needsAttention,
  notebook,
  search,
  type Notebook,
  type Place,
} from '../src/core/views';
import { isOverdue } from '../src/shared/due';
import type { Dump } from '../src/shared/schema';

// The core's views as text, one dump per line, so a view reads like the screen every client
// draws. `--json` prints the same sections with whole dumps.

export type Section = { title: string; dumps: Dump[] };
export type View = { title: string; sections: Section[] };

export const shortId = (id: string) => id.slice(0, 8);

const oldestFirst = (dumps: Dump[]) => [...dumps].reverse();
const days = (dumps: Dump[], now: number): Section[] =>
  byDay(dumps).map(({ day, dumps }) => ({ title: dayLabel(day, now), dumps }));

export function view(
  name: 'home' | 'done' | 'inbox' | 'list' | 'search',
  snapshot: Snapshot,
  now: number,
  argument = '',
): View {
  const book = notebook(snapshot);
  if (name === 'home') {
    const plan = home(book, now);
    return {
      title: 'Home',
      sections: [
        ...days(plan.earlier, now),
        { title: `Today · ${plan.heading}${plan.quiet ? ' · A clear day.' : ''}`, dumps: [] },
        ...plan.sections.map((part) => ({ title: `  ${part.label}`, dumps: part.dumps })),
      ],
    };
  }
  if (name === 'done') return { title: 'Done', sections: days(oldestFirst(book.done), now) };
  if (name === 'inbox')
    return { title: 'Inbox (Sort inbox)', sections: [{ title: '', dumps: book.unfiled }] };
  if (name === 'search')
    return { title: `Search “${argument}”`, sections: days(search(argument, book), now) };
  const place: Place = { kind: 'list', id: argument };
  return {
    title: book.listLabel(argument),
    sections: days(oldestFirst(dumpsIn(place, book)), now),
  };
}

export function line(dump: Dump, book: Notebook, now: number) {
  const mark = dump.deleted ? '✕' : dump.done ? '●' : book.sorting.has(dump.id) ? '…' : '○';
  const text = dump.text.split('\n')[0] ?? '';
  const list = book.sorting.has(dump.id) ? 'Sorting…' : book.listLabel(dump.list);
  const meta = [`[${list}${dump.classified_by === 'ai' ? ' · Jev' : ''}]`];
  if (dump.due)
    meta.push(`due ${dueLabel(dump.due, now)}${isOverdue(dump, now) ? ' (overdue)' : ''}`);
  if (dump.tags.length) meta.push(dump.tags.map((tag) => `#${tag}`).join(' '));
  return `${shortId(dump.id)} ${mark} ${text.length > 72 ? `${text.slice(0, 71)}…` : text}  ${meta.join('  ')}`;
}

export function text(shown: View, snapshot: Snapshot, now: number) {
  const book = notebook(snapshot);
  const out = [shown.title];
  for (const section of shown.sections) {
    if (section.title) out.push(section.title);
    const indent = ' '.repeat(section.title.length - section.title.trimStart().length + 2);
    for (const dump of section.dumps) out.push(`${indent}${line(dump, book, now)}`);
  }
  if (shown.sections.every((section) => section.dumps.length === 0)) out.push('  (nothing here)');
  return out.join('\n');
}

export function status(
  snapshot: Snapshot,
  profile: { id: string; server: { baseUrl: string } | null },
) {
  const book = notebook(snapshot);
  return [
    `notebook ${shortId(profile.id)} · ${profile.server?.baseUrl ?? 'this device only'}`,
    `sync ${snapshot.sync}${snapshot.syncError ? ` · ${snapshot.syncError}` : ''}`,
    `${book.open.length} open · ${book.done.length} done · ${book.unfiled.length} unfiled · ${book.sorting.size} sorting · ${book.lists.length} lists`,
    ...(snapshot.storageError ? [`storage error · ${snapshot.storageError}`] : []),
    ...(needsAttention(snapshot) ? ['Settings needs attention'] : []),
  ].join('\n');
}
