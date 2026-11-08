import type { Dump } from './schema';

const pad = (value: number) => String(value).padStart(2, '0');

export function dayKey(time: number | Date) {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfDay(time: number | Date) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
export function dayFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function calendar(year: number, month: number, day: number) {
  const date = new Date(year, month, day);
  return date.getMonth() === month && date.getDate() === day ? date : null;
}
const plus = (from: Date, days: number) =>
  new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const QUALIFIER = '(next|this|coming|on|by|before|until|till|due)';
const COUNTS = new Map([
  ['a', 1],
  ['an', 1],
  ['one', 1],
  ['two', 2],
  ['three', 3],
]);

function weekday(today: Date, name: string, qualifier: string | undefined) {
  const target = WEEKDAYS.indexOf(name.slice(0, 3));
  if (qualifier !== 'next') return plus(today, (target - today.getDay() + 7) % 7);
  const nextMonday = plus(today, 7 - ((today.getDay() + 6) % 7));
  return plus(nextMonday, (target + 6) % 7);
}

function monthDay(today: Date, month: string, day: string, year: string | undefined) {
  const index = MONTHS.indexOf(month.slice(0, 3));
  if (year) return calendar(Number(year), index, Number(day));
  const thisYear = calendar(today.getFullYear(), index, Number(day));
  if (thisYear && thisYear >= today) return thisYear;
  return calendar(today.getFullYear() + 1, index, Number(day));
}

function dayOfMonth(today: Date, day: number) {
  for (let ahead = 0; ahead < 12; ahead++) {
    const date = calendar(today.getFullYear(), today.getMonth() + ahead, day);
    if (date && date >= today) return date;
  }
  return null;
}

type Rule = { pattern: RegExp; resolve(match: RegExpExecArray, today: Date): Date | null };
const RULES: Rule[] = [
  {
    pattern: /\b(\d{4})-(\d{2})-(\d{2})\b/,
    resolve: (match) => calendar(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  },
  { pattern: /\b(?:the\s+)?day\s+after\s+tomorrow\b/, resolve: (_match, today) => plus(today, 2) },
  { pattern: /\b(?:today|tonight)\b/, resolve: (_match, today) => today },
  { pattern: /\b(?:tomorrow|tmrw|tmr)\b/, resolve: (_match, today) => plus(today, 1) },
  {
    pattern: /\bin\s+(\d{1,3}|an?|one|two|three)\s+(day|week)s?\b/,
    resolve: (match, today) =>
      plus(today, (COUNTS.get(match[1]) ?? Number(match[1])) * (match[2] === 'week' ? 7 : 1)),
  },
  {
    pattern: new RegExp(
      `\\b(?:${QUALIFIER}\\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\\b`,
    ),
    resolve: (match, today) => weekday(today, match[2], match[1]),
  },
  // Short weekday names are ordinary words too (sat, sun, wed), so they need a qualifier.
  {
    pattern: new RegExp(`\\b${QUALIFIER}\\s+(sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)\\b`),
    resolve: (match, today) => weekday(today, match[2], match[1]),
  },
  {
    pattern: new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?`),
    resolve: (match, today) => monthDay(today, match[1], match[2], match[3]),
  },
  {
    pattern: new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b(?:,?\\s+(\\d{4})\\b)?`,
    ),
    resolve: (match, today) => monthDay(today, match[2], match[1], match[3]),
  },
  {
    pattern: /\b(?:(?:on|by|before|until|till|due)\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/,
    resolve: (match, today) => dayOfMonth(today, Number(match[1])),
  },
];

export function parseDue(text: string, now: number): string | null {
  const words = text.toLowerCase().replace(/https?:\/\/\S+/g, (link) => ' '.repeat(link.length));
  const today = startOfDay(now);
  let found: { at: number; day: Date } | undefined;
  for (const rule of RULES) {
    const match = rule.pattern.exec(words);
    if (!match || (found && found.at <= match.index)) continue;
    const day = rule.resolve(match, today);
    if (day) found = { at: match.index, day };
  }
  return found ? dayKey(found.day) : null;
}

export const isOverdue = (dump: Dump, now: number) =>
  !dump.done && dump.due !== null && dump.due < dayKey(now);

export function dayChoices(now: number) {
  const today = startOfDay(now);
  return { today: dayKey(today), tomorrow: dayKey(plus(today, 1)) };
}

const byCreated = (a: Dump, b: Dump) => a.created_at - b.created_at || a.id.localeCompare(b.id);

export function agenda(open: Dump[], now: number) {
  const today = dayKey(now);
  const start = startOfDay(now).getTime();
  const dated = open
    .flatMap((dump) => (dump.due ? [{ dump, due: dump.due }] : []))
    .sort((a, b) => a.due.localeCompare(b.due) || byCreated(a.dump, b.dump));
  const undated = open.filter((dump) => !dump.due).sort(byCreated);
  const pick = (keep: (due: string) => boolean) =>
    dated.filter(({ due }) => keep(due)).map(({ dump }) => dump);
  return {
    earlier: undated.filter((dump) => dump.created_at < start),
    overdue: pick((due) => due < today),
    due: pick((due) => due === today),
    upcoming: pick((due) => due > today),
    dumped: undated.filter((dump) => dump.created_at >= start),
  };
}
