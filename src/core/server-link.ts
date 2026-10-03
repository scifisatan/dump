import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import { SYNC_FRAGMENT_BYTES, SYNC_TIMEOUT_SECONDS } from '../shared/merge';
import type { ServerLink } from './client';
import { requestList } from './classify';
import {
  ConnectionError,
  inspectServer,
  requestTicket,
  syncUrl,
  Unauthorized,
  type ServerLocation,
} from './connection';

// One server, reached with the host's fetch and WebSocket (a browser, or the Mac app's shims).
// `readKey` runs on every use, so a key entered again in Settings applies without reopening.
export function createServerLink(server: ServerLocation, readKey: () => string | null): ServerLink {
  const key = () => {
    const value = readKey();
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
