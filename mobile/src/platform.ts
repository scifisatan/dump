import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import { openDatabaseSync } from 'expo-sqlite';
import { AppState } from 'react-native';
import { createExpoSqlitePersister } from 'tinybase/persisters/persister-expo-sqlite';
import type { ClientPlatform } from '../../src/core/client';
import { databaseName, type ServerProfile } from '../../src/core/connection';
import { deviceEvents } from '../../src/core/device';
import { createServerLink } from '../../src/core/server-link';
import { readKey } from './profiles';

const device = deviceEvents();
void getNetworkStateAsync()
  .then((state) => device.network(state.isConnected !== false))
  .catch(() => {});
addNetworkStateListener((state) => device.network(state.isConnected !== false));
AppState.addEventListener('change', (state) => {
  if (state === 'active') device.resume();
  else if (state === 'background') device.suspend();
});

// The notebook as TinyBase JSON in one SQLite table: mergeable content, so sync metadata
// survives restarts.
const TABLE = 'notebook';

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
    isOnline: device.isOnline,
    watch: device.watch,
  };
}
