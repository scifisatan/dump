import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { createDumpClient, Snapshot } from '../src/core/client';
import { checkServer } from '../src/core/connection';
import { profileRegistry } from '../src/core/profiles';
import { createSession } from '../src/core/session';
import { notebook } from '../src/core/views';
import { parseDue } from '../src/shared/due';
import { newStore, readRows } from '../src/shared/merge';
import { LIST_COLORS, listSchema } from '../src/shared/schema';
import { nodeDevice } from './platform';
import { line, status, text, view, type View } from './render';
import { createFilePersister } from 'tinybase/persisters/persister-file';

const HELP = `dump: the notebook's core on Node, as a device you drive from a shell.

  node cli/dump.mjs [--device NAME] [--now TIME] [--json] COMMAND [ARGS]

Devices (each a folder under .dump/devices/; --data DIR uses another folder)
  connect scratch|dev|URL [--key KEY]  join a server's notebook. scratch is \`npm run scratch\`,
                                       dev is \`npm run dev\` (Abi's local data: clean up after)
  sign-in --key KEY                    save a new owner key for this notebook
  status                               notebook, server, sync state and counts
  forget                               delete this device's folder

Views (as every client shows them)
  home | done | inbox | list LIST | search WORDS

Commands (the core's own; DUMP is an ID or its first characters, LIST an ID, label or inbox)
  capture TEXT [--list LIST] [--due DAY|none]
  set-done DUMP [--undo]    set-due DUMP DAY|none    file DUMP LIST    remove DUMP
  save-list LABEL [--color HEX] [--id LIST]    delete-list LIST    clear-done
  backup                    import FILE

Inspecting
  rows                                 every row as decoded, tombstones included (JSON)
  peek FILE [VIEW [ARG]]               a notebook file, such as the Mac app's, read only

Each run opens the notebook, waits for sync and for Jev to file new dumps (--wait SECONDS,
default 15), runs the command, saves, and exits. DAY is anything a dump can say: friday,
tomorrow, oct 24, 2026-10-24. --now moves this run's clock (ISO time) to test days.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    device: { type: 'string', short: 'd', default: 'a' },
    data: { type: 'string' },
    now: { type: 'string' },
    json: { type: 'boolean', default: false },
    key: { type: 'string' },
    list: { type: 'string' },
    due: { type: 'string' },
    color: { type: 'string' },
    id: { type: 'string' },
    undo: { type: 'boolean', default: false },
    wait: { type: 'string', default: '15' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

class Usage extends Error {}
const root = process.env.DUMP_ROOT ?? process.cwd();
const folder = resolve(values.data ?? join(root, '.dump', 'devices', values.device));
const wait = Number(values.wait) * 1000;

function moveClock(to: string) {
  const offset = Date.parse(to) - Date.now();
  if (Number.isNaN(offset)) throw new Usage('--now needs an ISO time, such as 2026-11-09T09:00.');
  const realNow = Date.now.bind(Date);
  Date.now = () => realNow() + offset;
}

const servers = new Map([
  ['scratch', { address: 'http://localhost:6195', key: () => envKey('tests/e2e/server.env') }],
  ['dev', { address: 'http://localhost:6190', key: () => 'dump-local-development-owner-key' }],
]);
function envKey(path: string) {
  const match = /^OWNER_KEY=(.+)$/m.exec(readFileSync(join(root, path), 'utf8'));
  if (!match?.[1]) throw new Error(`${path} has no OWNER_KEY.`);
  return match[1].trim();
}

const until = async (done: () => boolean, timeout: number) => {
  const end = Date.now() + timeout;
  while (!done() && Date.now() < end) await new Promise((next) => setTimeout(next, 50));
  return done();
};

type Client = ReturnType<typeof createDumpClient>;

function dumpFor(client: Client, prefix: string | undefined) {
  if (!prefix) throw new Usage('Name a dump by its ID or its first characters.');
  const found = client.getSnapshot().dumps.filter((dump) => dump.id.startsWith(prefix));
  if (found.length !== 1)
    throw new Usage(
      found.length ? `${prefix} matches ${found.length} dumps.` : `No dump ${prefix}.`,
    );
  return found[0]!;
}

function listFor(snapshot: Snapshot, name: string | undefined) {
  if (!name) throw new Usage('Name a list by its ID or label, or inbox.');
  if (name.toLowerCase() === 'inbox') return null;
  const lists = notebook(snapshot).lists;
  const list =
    lists.find((item) => item.id === name) ??
    lists.find((item) => item.label.toLowerCase() === name.toLowerCase());
  if (!list) throw new Usage(`No list ${name}. Lists: ${lists.map((item) => item.id).join(', ')}.`);
  return listSchema.parse(list.id);
}

function dayFor(input: string | undefined) {
  if (input === undefined) throw new Usage('Name a day, or none.');
  if (input === 'none') return null;
  const due = parseDue(input, Date.now());
  if (!due) throw new Usage(`Can't read a day from “${input}”.`);
  return due;
}

const print = (shown: View, snapshot: Snapshot) =>
  values.json ? JSON.stringify(shown, null, 2) : text(shown, snapshot, Date.now());

function showView(name: string, args: string[], snapshot: Snapshot) {
  if (name === 'home' || name === 'done' || name === 'inbox')
    return print(view(name, snapshot, Date.now()), snapshot);
  if (name === 'search')
    return print(view('search', snapshot, Date.now(), args.join(' ')), snapshot);
  if (name === 'list') {
    const list = listFor(snapshot, args[0]);
    if (list === null) return print(view('inbox', snapshot, Date.now()), snapshot);
    return print(view('list', snapshot, Date.now(), list), snapshot);
  }
  return null;
}

async function peek(path: string | undefined, args: string[]) {
  if (!path || !existsSync(path)) throw new Usage('peek needs a notebook file.');
  const store = newStore();
  const persister = createFilePersister(store, path);
  await persister.load();
  const snapshot: Snapshot = {
    ...readRows(store),
    ready: true,
    saving: false,
    storageError: null,
    sync: 'local',
    localServer: false,
    syncError: null,
    sorting: new Set(),
  };
  await persister.destroy();
  return (
    showView(args[0] ?? 'home', args.slice(1), snapshot) ??
    'Views: home, done, inbox, list, search.'
  );
}

async function main(): Promise<string> {
  const [command = 'help', ...args] = positionals;
  if (values.help || command === 'help') return HELP;
  if (values.now) moveClock(values.now);
  if (command === 'peek') return peek(args[0], args.slice(1));
  if (command === 'forget') {
    rmSync(folder, { recursive: true, force: true });
    return `Forgot ${folder}.`;
  }

  const device = nodeDevice(folder);
  const registry = profileRegistry(device.setting('connections'));
  const session = createSession({ registry, platform: device.platform, saveKey: device.saveKey });
  const opened = async () => {
    const current = session.get();
    await current.ready;
    if (current.openError) throw new Error(current.openError);
    const { client } = current;
    await until(() => !['connecting', 'syncing'].includes(client.getSnapshot().sync), wait);
    return current;
  };

  let current = await opened();
  if (command === 'connect') {
    const target = servers.get(args[0] ?? '');
    const address = target?.address ?? args[0];
    const key = values.key ?? target?.key();
    if (!address || !key) throw new Usage('connect needs scratch, dev, or a URL with --key.');
    const { baseUrl, instanceId } = await checkServer(address);
    await session.connect({ baseUrl, instanceId }, key);
    current = await opened();
  }
  if (command === 'sign-in') {
    if (!values.key) throw new Usage('sign-in needs --key.');
    await session.signIn(values.key);
    current = await opened();
  }

  const { client, profile } = current;
  const snapshot = () => client.getSnapshot();
  const book = () => notebook(snapshot());
  let changed: string[] = [];
  let output: (() => string) | null = null;

  switch (command) {
    case 'connect':
    case 'sign-in':
    case 'status':
      output = () => status(snapshot(), profile);
      break;
    case 'capture': {
      const raw = args.join(' ');
      const list = values.list === undefined ? null : listFor(snapshot(), values.list);
      const due = values.due === undefined ? undefined : dayFor(values.due);
      changed = [client.capture(raw, list, due).id];
      break;
    }
    case 'set-done':
      changed = [dumpFor(client, args[0]).id];
      client.setDone(changed[0]!, !values.undo);
      break;
    case 'set-due':
      changed = [dumpFor(client, args[0]).id];
      client.setDue(changed[0]!, dayFor(args.slice(1).join(' ') || undefined));
      break;
    case 'file':
      changed = [dumpFor(client, args[0]).id];
      client.file(changed[0]!, listFor(snapshot(), args[1]));
      break;
    case 'remove':
      changed = [dumpFor(client, args[0]).id];
      client.remove(changed[0]!);
      break;
    case 'save-list': {
      const id =
        values.id === undefined ? undefined : (listFor(snapshot(), values.id) ?? undefined);
      const list = client.saveList(args.join(' '), values.color ?? LIST_COLORS[0]!, id);
      output = () => `${list.id}  ${list.label}  ${list.color}`;
      break;
    }
    case 'delete-list': {
      const list = listFor(snapshot(), args[0]);
      if (list === null) throw new Usage('The inbox is not a list.');
      client.deleteList(list);
      output = () => `Deleted ${list}.`;
      break;
    }
    case 'clear-done': {
      const count = client.clearDone();
      output = () => `Removed ${count} done.`;
      break;
    }
    case 'backup':
      output = () => JSON.stringify(client.backup(), null, 2);
      break;
    case 'import': {
      if (!args[0]) throw new Usage('import needs a backup file.');
      const added = client.importDumps(JSON.parse(readFileSync(args[0], 'utf8')));
      output = () => `Imported ${added} dumps.`;
      break;
    }
    case 'rows':
      output = () => JSON.stringify({ dumps: snapshot().dumps, lists: snapshot().lists }, null, 2);
      break;
    default:
      output = () => {
        const shown = showView(command, args, snapshot());
        if (shown === null) throw new Usage(`Unknown command ${command}. Run with --help.`);
        return shown;
      };
  }

  // Let Jev answer, then let the store go quiet so the server has every change.
  await until(() => snapshot().sorting.size === 0, wait);
  let last = Date.now();
  const stopWatching = client.subscribe(() => (last = Date.now()));
  await until(() => Date.now() - last > 300, wait);
  stopWatching();

  const result = output
    ? output()
    : values.json
      ? JSON.stringify(
          changed.map((id) => snapshot().dumps.find((dump) => dump.id === id)),
          null,
          2,
        )
      : changed
          .map((id) => snapshot().dumps.find((dump) => dump.id === id))
          .map((dump) => (dump ? line(dump, book(), Date.now()) : ''))
          .join('\n');
  const state = snapshot();
  await client.stop();
  if (profile.server && state.sync !== 'synced')
    process.stderr.write(`sync ${state.sync}${state.syncError ? `: ${state.syncError}` : ''}\n`);
  return result;
}

main().then(
  (result) => {
    if (result) process.stdout.write(`${result}\n`);
    process.exit(0);
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(error instanceof Usage ? 2 : 1);
  },
);
