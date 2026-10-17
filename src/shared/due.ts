import type { Dump } from './schema';

// A dump's due day is a calendar date, YYYY-MM-DD, in this device's time zone, with no time.
// It is read from the dump's words at capture: today, tomorrow, a weekday, "in 3 days", "oct 24",
// "the 24th", or 2026-10-24.

const pad = (value: number) => String(value).padStart(2, '0');

// The day `time` falls on in this device's time zone.
export function dayKey(time: number | Date) {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// A local calendar date, or null when that day does not exist (February 30).
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

// A weekday is its next occurrence, today included. "next friday" is the Friday of next week,
// counting weeks from Monday.
function weekday(today: Date, name: string, qualifier: string | undefined) {
  const target = WEEKDAYS.indexOf(name.slice(0, 3));
  if (qualifier !== 'next') return plus(today, (target - today.getDay() + 7) % 7);
  const nextMonday = plus(today, 7 - ((today.getDay() + 6) % 7));
  return plus(nextMonday, (target + 6) % 7);
}

// A month and day without a year is the next one, today included.
function monthDay(today: Date, month: string, day: string, year: string | undefined) {
  const index = MONTHS.indexOf(month.slice(0, 3));
  if (year) return calendar(Number(year), index, Number(day));
  const thisYear = calendar(today.getFullYear(), index, Number(day));
  if (thisYear && thisYear >= today) return thisYear;
  return calendar(today.getFullYear() + 1, index, Number(day));
}

// "the 24th" is the next 24th, today included, skipping months too short to have one.
function dayOfMonth(today: Date, day: number) {
  for (let ahead = 0; ahead < 12; ahead++) {
    const date = calendar(today.getFullYear(), today.getMonth() + ahead, day);
    if (date && date >= today) return date;
  }
  return null;
}

type Rule = { pattern: RegExp; resolve(match: RegExpExecArray, today: Date): Date | null };
// Each match is tried at its earliest position in the text; on a tie, the earlier rule wins.
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

// The day a capture names, relative to `now`, or null when it names none. Links are skipped, so
// a date in a URL's path is not read as a due day. The earliest phrase in the text wins.
export function parseDue(text: string, now: number): string | null {
  const words = text.toLowerCase().replace(/https?:\/\/\S+/g, (link) => ' '.repeat(link.length));
  const time = new Date(now);
  const today = new Date(time.getFullYear(), time.getMonth(), time.getDate());
  let found: { at: number; day: Date } | undefined;
  for (const rule of RULES) {
    const match = rule.pattern.exec(words);
    if (!match || (found && found.at <= match.index)) continue;
    const day = rule.resolve(match, today);
    if (day) found = { at: match.index, day };
  }
  return found ? dayKey(found.day) : null;
}

const byCreated = (a: Dump, b: Dump) => a.created_at - b.created_at || a.id.localeCompare(b.id);

// Home on every client: older undated dumps, then Today just above the composer. Each part is in
// display order, top to bottom. `open` is the open dumps, in any order.
export function agenda(open: Dump[], now: number) {
  const today = dayKey(now);
  const time = new Date(now);
  const start = new Date(time.getFullYear(), time.getMonth(), time.getDate()).getTime();
  const dated = open
    .flatMap((dump) => (dump.due ? [{ dump, due: dump.due }] : []))
    .sort((a, b) => a.due.localeCompare(b.due) || byCreated(a.dump, b.dump));
  const undated = open.filter((dump) => !dump.due).sort(byCreated);
  const pick = (keep: (due: string) => boolean) =>
    dated.filter(({ due }) => keep(due)).map(({ dump }) => dump);
  return {
    // Undated dumps captured before today, by the day they were captured.
    earlier: undated.filter((dump) => dump.created_at < start),
    // Open dumps whose day has passed stay here until they are done, moved or undated.
    overdue: pick((due) => due < today),
    due: pick((due) => due === today),
    upcoming: pick((due) => due > today),
    // Today's undated dumps, newest at the bottom.
    dumped: undated.filter((dump) => dump.created_at >= start),
  };
}
export type Agenda = ReturnType<typeof agenda>;
