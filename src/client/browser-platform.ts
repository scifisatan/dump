import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db';
import { createBroadcastChannelSynchronizer } from 'tinybase/synchronizers/synchronizer-broadcast-channel';
import type { ClientPlatform } from '../core/client';
import { channelName, databaseName, type ServerProfile } from '../core/connection';
import { createServerLink } from '../core/server-link';
import { readKey } from './profiles';

export function browserPlatform(profile: ServerProfile): ClientPlatform {
  return {
    storage: (store, onError) => ({
      persister: createIndexedDbPersister(store, databaseName(profile), 1, onError),
      isEmpty: () =>
        new Promise<boolean>((resolve, reject) => {
          const request = indexedDB.open(databaseName(profile));
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('Close other Dump tabs and retry.'));
          request.onsuccess = () => {
            const empty = request.result.objectStoreNames.length === 0;
            request.result.close();
            resolve(empty);
          };
        }),
    }),
    storageFailure:
      'This browser could not save your changes. Keep this tab open and export a copy.',
    server: profile.server && createServerLink(profile.server, () => readKey(profile.id)),
    isOnline: () => navigator.onLine,
    watch(resume, offline, suspend) {
      const visible = () => {
        if (document.visibilityState === 'visible') resume();
        else suspend();
      };
      window.addEventListener('online', resume);
      window.addEventListener('offline', offline);
      window.addEventListener('pagehide', suspend);
      document.addEventListener('visibilitychange', visible);
      return () => {
        window.removeEventListener('online', resume);
        window.removeEventListener('offline', offline);
        window.removeEventListener('pagehide', suspend);
        document.removeEventListener('visibilitychange', visible);
      };
    },
    tabs(store) {
      if (typeof BroadcastChannel === 'undefined') return { async start() {}, async destroy() {} };
      const tabs = createBroadcastChannelSynchronizer(store, channelName(profile));
      return {
        async start() {
          await tabs.startSync();
        },
        async destroy() {
          await tabs.destroy();
        },
      };
    },
  };
}
