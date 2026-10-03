import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db';
import { createBroadcastChannelSynchronizer } from 'tinybase/synchronizers/synchronizer-broadcast-channel';
import type { ClientPlatform } from '../core/client';
import { channelName, databaseName, type ServerProfile } from '../core/connection';
import { createServerLink } from '../core/server-link';
import { readKey } from './profiles';

export function browserPlatform(profile: ServerProfile): ClientPlatform {
  return {
    persistence(store, status) {
      let failure: unknown;
      const report =
        'This browser could not save your changes. Keep this tab open and export a copy.';
      const persister = createIndexedDbPersister(store, databaseName(profile), 1, (error) => {
        failure = error;
        status(false, report);
      });
      const listener = persister.addStatusListener((_persister, value) => {
        if (value === 2) failure = undefined;
        status(value === 2, failure ? report : null);
      });
      const check = () => {
        if (failure) throw new Error(report);
      };
      return {
        async load() {
          const empty = await new Promise<boolean>((resolve, reject) => {
            const request = indexedDB.open(databaseName(profile));
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Close other Dump tabs and retry.'));
            request.onsuccess = () => {
              const isEmpty = request.result.objectStoreNames.length === 0;
              request.result.close();
              resolve(isEmpty);
            };
          });
          if (empty) {
            await persister.save();
            check();
          }
          await persister.load();
          check();
        },
        async save() {
          await persister.save();
          check();
        },
        async start() {
          await persister.startAutoSave();
          check();
        },
        async destroy() {
          await persister.destroy();
          persister.delListener(listener);
        },
      };
    },
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
