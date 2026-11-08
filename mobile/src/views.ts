import { byDay, dayLabel, home, type Notebook, type Place } from '../../src/core/views';
import type { Dump } from '../../src/shared/schema';

// The core's views (src/core/views.ts) as the phone's screens lay them out: in inverted lists,
// which draw their first row at the bottom, next to the composer.

export function placeTitle(place: Place, notebook: Notebook) {
  if (place.kind === 'home') return 'Home';
  if (place.kind === 'done') return 'Done';
  return notebook.list(place.id)?.label ?? 'Home';
}

export type Row =
  | { type: 'day'; key: string; label: string; overdue?: boolean }
  | { type: 'today'; key: string; summary: string }
  | { type: 'quiet'; key: string }
  | { type: 'done'; key: string; count: number }
  | { type: 'dump'; key: string; dump: Dump };

// Newest dump first, and each day's heading after its dumps so that it shows above them.
export function rows(dumps: Dump[], now: number): Row[] {
  return byDay(dumps).flatMap(({ day, dumps }): Row[] => [
    ...dumps.map((dump): Row => ({ type: 'dump', key: dump.id, dump })),
    { type: 'day', key: `day-${day}`, label: dayLabel(day, now) },
  ]);
}

export function homeRows(notebook: Notebook, now: number): Row[] {
  const plan = home(notebook, now);
  const top: Row[] = [];
  if (notebook.done.length > 0)
    top.push({ type: 'done', key: 'done', count: notebook.done.length });
  top.push(...rows([...plan.earlier].reverse(), now).reverse());
  top.push({ type: 'today', key: 'today', summary: plan.heading });
  if (plan.quiet) top.push({ type: 'quiet', key: 'today-quiet' });
  for (const section of plan.sections) {
    top.push({
      type: 'day',
      key: `today-${section.key}`,
      label: section.label,
      overdue: section.overdue,
    });
    for (const dump of section.dumps) top.push({ type: 'dump', key: dump.id, dump });
  }
  return top.reverse();
}
