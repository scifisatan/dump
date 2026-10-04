import { createCustomPersister, Persists } from 'tinybase/persisters';
import type { MergeableContent } from 'tinybase';
import type { ClientPlatform } from '../../src/core/client';
import type { ServerProfile } from '../../src/core/connection';
import { createServerLink } from '../../src/core/server-link';
import { host, native } from './native';

// Device events from the host (network changes, wake, sleep), routed to the open notebook.
const watchers = new Set<{ resume(): void; offline(): void; suspend(): void }>();
export const deviceEvents = {
  network(online: boolean) {
    for (const watcher of watchers) (online ? watcher.resume : watcher.offline)();
  },
  resume() {
    for (const watcher of watchers) watcher.resume();
  },
  suspend() {
    for (const watcher of watchers) watcher.suspend();
  },
};

let nextWrite = 1;
const writes = new Map<number, (error: string | null) => void>();
host.written = (id: number, error: string | null) => {
  writes.get(id)?.(error);
  writes.delete(id);
};
const writeFile = (name: string, content: string) =>
  new Promise<void>((resolve, reject) => {
    const id = nextWrite++;
    writes.set(id, (error) => (error === null ? resolve() : reject(new Error(error))));
    native.writeFile(id, name, content);
  });

// TinyBase's own JSON form, which keeps `undefined` (deleted cells) distinct from null.
const UNDEFINED = '￼';
const encode = (content: MergeableContent) =>
  JSON.stringify(content, (_key, value: unknown) => (value === undefined ? UNDEFINED : value));
const decode = (text: string): MergeableContent => restore(JSON.parse(text)) as MergeableContent;
function restore(value: unknown): unknown {
  if (value === UNDEFINED) return undefined;
  if (Array.isArray(value)) return value.map(restore);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restore(item)]));
  return value;
}

// The Mac app: one JSON file per notebook in the app's data folder, the server through the shared
// link, and one process, so there are no tabs to keep in step.
export function macPlatform(profile: ServerProfile): ClientPlatform {
  const file = `${profile.id}.json`;
  return {
    storage: (store, onError) => ({
      persister: createCustomPersister(
        store,
        async () => {
          const text = native.readFile(file);
          return text ? decode(text) : undefined;
        },
        async (getContent) => writeFile(file, encode(getContent())),
        () => 0,
        () => {},
        onError,
        Persists.MergeableStoreOnly,
      ),
      isEmpty: async () => native.readFile(file) === null,
    }),
    storageFailure: 'This Mac could not save your changes. Keep Dump open and try again.',
    server: profile.server && createServerLink(profile.server, () => native.ownerKey(profile.id)),
    isOnline: () => native.isOnline(),
    watch(resume, offline, suspend) {
      const watcher = { resume, offline, suspend };
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
    tabs: () => ({ async start() {}, async destroy() {} }),
  };
}
