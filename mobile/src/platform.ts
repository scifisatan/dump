import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import { openDatabaseSync } from 'expo-sqlite';
import { AppState } from 'react-native';
import { createExpoSqlitePersister } from 'tinybase/persisters/persister-expo-sqlite';
import type { ClientPlatform } from '../../src/core/client';
import { databaseName, type ServerProfile } from '../../src/core/connection';
import { createServerLink } from '../../src/core/server-link';
import { readKey } from './profiles';

// Device events, routed to the open notebook: the network coming and going, and the app moving
// to and from the background.
type Watcher = { resume(): void; offline(): void; suspend(): void };
const watchers = new Set<Watcher>();

// The core asks synchronously, so keep the last answer. Until the first one, assume a network:
// a failed attempt only schedules a retry.
let online = true;
const network = (connected: boolean | undefined) => {
  const next = connected !== false;
  if (next === online) return;
  online = next;
  for (const watcher of watchers) (next ? watcher.resume : watcher.offline)();
};
void getNetworkStateAsync()
  .then((state) => network(state.isConnected))
  .catch(() => {});
addNetworkStateListener((state) => network(state.isConnected));
AppState.addEventListener('change', (state) => {
  if (state === 'active') for (const watcher of watchers) watcher.resume();
  else if (state === 'background') for (const watcher of watchers) watcher.suspend();
});

// The notebook as TinyBase JSON in one SQLite table: mergeable content, so sync metadata
// survives restarts.
const TABLE = 'notebook';

// The phone app: one SQLite database per notebook, the server through the shared link, and one
// process, so there are no tabs to keep in step.
export function mobilePlatform(profile: ServerProfile): ClientPlatform {
  return {
    storage(store, onError) {
      const db = openDatabaseSync(`${databaseName(profile)}.db`);
      return {
        persister: createExpoSqlitePersister(
          store,
          db,
          { mode: 'json', storeTableName: TABLE },
          undefined,
          onError,
        ),
        isEmpty: async () =>
          (await db.getFirstAsync(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            TABLE,
          )) === null,
      };
    },
    storageFailure: 'This phone could not save your changes. Keep Dump open and try again.',
    server: profile.server && createServerLink(profile.server, () => readKey(profile.id)),
    isOnline: () => online,
    watch(resume, offline, suspend) {
      const watcher = { resume, offline, suspend };
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
    tabs: () => ({ async start() {}, async destroy() {} }),
  };
}
