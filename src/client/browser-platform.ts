import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db';
import { createBroadcastChannelSynchronizer } from 'tinybase/synchronizers/synchronizer-broadcast-channel';
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import type { ClientPlatform, ServerLink } from '../core/client';
import { requestList } from '../core/classify';
import {
  channelName,
  ConnectionError,
  databaseName,
  inspectServer,
  requestTicket,
  syncUrl,
  Unauthorized,
  type ServerLocation,
  type ServerProfile,
} from '../core/connection';
import { SYNC_FRAGMENT_BYTES, SYNC_TIMEOUT_SECONDS } from '../shared/merge';
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
    server: profile.server && serverLink(profile.id, profile.server),
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

function serverLink(profileId: string, server: ServerLocation): ServerLink {
  // Read on every use, so a key entered again in Settings applies without reopening.
  const key = () => {
    const value = readKey(profileId);
    if (!value) throw new Unauthorized('Enter this server’s owner key in Settings.');
    return value;
  };
  return {
    async inspect(signal) {
      const info = await inspectServer(server.baseUrl, signal);
      signal.throwIfAborted();
      if (info.instanceId !== server.instanceId)
        throw new ConnectionError(
          'This address now belongs to a different notebook. Connect again in Settings to open it separately.',
        );
      return info;
    },
    async connect(store, info, signal, closed) {
      const ticket = await requestTicket(server.baseUrl, key(), signal);
      const socket = new WebSocket(syncUrl(server.baseUrl, info.instanceId, ticket));
      const abort = () => socket.close();
      signal.addEventListener('abort', abort, { once: true });
      try {
        const synchronizer = await createWsSynchronizer(
          store,
          socket,
          SYNC_TIMEOUT_SECONDS,
          undefined,
          undefined,
          undefined,
          SYNC_FRAGMENT_BYTES,
        );
        socket.addEventListener('close', closed);
        return {
          async start() {
            await synchronizer.startSync();
          },
          async destroy() {
            socket.removeEventListener('close', closed);
            signal.removeEventListener('abort', abort);
            await synchronizer.destroy();
          },
        };
      } catch (error) {
        signal.removeEventListener('abort', abort);
        socket.close();
        throw error;
      }
    },
    classify: (request, signal) => requestList(server.baseUrl, key(), request, signal),
  };
}
