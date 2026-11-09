// Polyfills load first, before TinyBase and Zod initialize.
import './polyfills';
import type { Snapshot } from '../../src/core/client';
import { checkServer, serverSchema } from '../../src/core/connection';
import { profileRegistry } from '../../src/core/profiles';
import { createSession, type Session } from '../../src/core/session';
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
  type Notebook,
} from '../../src/core/views';
import { dayChoices, dayKey, isOverdue, parseDue } from '../../src/shared/due';
import {
  LIST_COLORS,
  listPrefix,
  listSchema,
  paletteFor,
  prefixFor,
  type Collection,
  type Dump,
} from '../../src/shared/schema';
import { native } from './native';
import { device, macPlatform } from './platform';
import { origin, setting } from './settings';

const RECENT = 5;

const registry = profileRegistry(setting('connections'));
const session = createSession({
  registry,
  platform: macPlatform,
  saveKey: (profileId, key, server) => native.saveOwnerKey(profileId, key, server.baseUrl),
});

let open: Session | undefined;
let unsubscribe = () => {};
function follow() {
  const current = session.get();
  if (current === open) return;
  unsubscribe();
  open = current;
  unsubscribe = current.client.subscribe(() => native.changed());
  native.changed();
}
session.subscribe(follow);

function client() {
  if (!open) throw new Error('No notebook is open.');
  return open.client;
}

const item = (dump: Dump, book: Notebook, now: number) => ({
  id: dump.id,
  text: dump.text,
  list: dump.list,
  tags: dump.tags,
  done: dump.done,
  url: dump.url,
  due: dump.due,
  dueLabel: dump.due ? dueLabel(dump.due, now) : null,
  site: dump.url ? linkHost(dump.url) : null,
  overdue: isOverdue(dump, now),
  createdAt: dump.created_at,
  sorting: book.sorting.has(dump.id),
});

const ids = (dumps: Dump[]) => dumps.map((dump) => dump.id);

type Section = {
  id: string;
  title: string;
  overdue: boolean;
  today: boolean;
  quiet: boolean;
  ids: string[];
};
const section = (id: string, title: string, dumps: Dump[] = []): Section => ({
  id,
  title,
  overdue: false,
  today: false,
  quiet: false,
  ids: ids(dumps),
});
const days = (dumps: Dump[], now: number) =>
  byDay(dumps).map(({ day, dumps }) => section(`day-${day}`, dayLabel(day, now), dumps));
const oldestFirst = (dumps: Dump[]) => [...dumps].reverse();

function places(book: Notebook, now: number) {
  const plan = home(book, now);
  return {
    summary: plan.heading,
    home: [
      ...days(plan.earlier, now),
      { ...section('today', plan.heading), today: true, quiet: plan.quiet },
      ...plan.sections.map((part) => ({
        ...section(part.key, part.label, part.dumps),
        overdue: part.overdue,
      })),
    ],
    done: days(oldestFirst(book.done), now),
    lists: Object.fromEntries(
      book.lists.map((list) => [
        list.id,
        days(oldestFirst(dumpsIn({ kind: 'list', id: list.id }, book)), now),
      ]),
    ),
  };
}

function view(snapshot: Snapshot, full: boolean) {
  const now = Date.now();
  const book = notebook(snapshot);
  return {
    ready: snapshot.ready,
    sync: snapshot.sync,
    syncError: snapshot.syncError,
    saving: snapshot.saving,
    storageError: snapshot.storageError,
    attention: needsAttention(snapshot),
    profile: open?.profile ?? null,
    others: registry.others(),
    firstRun: open?.firstRun ?? false,
    openError: open?.openError ?? null,
    lists: book.lists.map(listView),
    webApp: webApp(),
    palette: LIST_COLORS,
    days: dayChoices(now),
    recent: book.dumps.slice(0, RECENT).map((dump) => item(dump, book, now)),
    unfiled: ids(book.unfiled),
    doneCount: book.done.length,
    dumps: full ? book.dumps.map((dump) => item(dump, book, now)) : [],
    places: full ? places(book, now) : null,
  };
}

const listView = (list: Collection) => ({
  id: list.id,
  label: list.label,
  color: list.color,
  prefix: prefixFor(list),
  palette: paletteFor(list.color),
});

const webApp = () => ({
  chosen: origin.chosen(),
  standard: origin.standard(open?.profile.server?.baseUrl),
});

const day = (due: string) => ({ due, label: dueLabel(due, Date.now()) });

const engine = {
  async launch() {
    follow();
    await open?.ready;
  },

  async close() {
    await open?.client.stop();
  },

  snapshot(full: boolean) {
    return JSON.stringify(open ? view(open.client.getSnapshot(), full) : null);
  },

  search(query: string) {
    const snapshot = client().getSnapshot();
    return JSON.stringify(days(search(query, notebook(snapshot)), Date.now()));
  },

  listFor(text: string) {
    return open ? (listPrefix(text, open.client.getSnapshot().lists)?.list ?? null) : null;
  },

  dueFor(text: string) {
    const due = parseDue(text, Date.now());
    return JSON.stringify(due ? day(due) : null);
  },

  dayAt(time: number) {
    return JSON.stringify(day(dayKey(time)));
  },

  capture(text: string, list: string | null, due: string | null) {
    const dump = client().capture(text, list, due);
    return JSON.stringify({ id: dump.id, list: dump.list, due: dump.due });
  },

  setDone(id: string, done: boolean) {
    client().setDone(id, done);
  },

  setDue(id: string, due: string | null) {
    client().setDue(id, due);
  },

  file(id: string, list: string | null) {
    client().file(id, list);
  },

  remove(id: string) {
    client().remove(id);
  },

  saveList(label: string, color: string, id: string | null) {
    return JSON.stringify(listView(client().saveList(label, color, id ?? undefined)));
  },

  deleteList(id: string) {
    client().deleteList(listSchema.parse(id));
  },

  clearDone() {
    return client().clearDone();
  },

  network(online: boolean) {
    device.network(online);
  },

  resume() {
    device.resume();
  },

  suspend() {
    device.suspend();
  },

  async check(address: string) {
    return JSON.stringify(await checkServer(address));
  },

  async connect(server: string, key: string) {
    await session.connect(serverSchema.parse(JSON.parse(server)), key);
  },

  async signIn(key: string) {
    await session.signIn(key);
  },

  async switchTo(profileId: string) {
    const profile = registry.others().find((item) => item.id === profileId);
    if (!profile) throw new Error('That notebook is no longer saved on this Mac.');
    await session.switchTo(profile);
  },

  chooseWebApp(input: string) {
    const chosen = origin.choose(input);
    native.changed();
    return chosen;
  },
};

(globalThis as unknown as { DumpEngine: typeof engine }).DumpEngine = engine;
