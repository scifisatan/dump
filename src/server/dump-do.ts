import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage';
import { WsServerDurableObject } from 'tinybase/synchronizers/synchronizer-ws-server-durable-object';
import { newStore, SYNC_FRAGMENT_BYTES, SYNC_TIMEOUT_SECONDS } from '../shared/merge';
import type { Env } from './env';

// TinyBase's WebSocket sync server. Clients and this object exchange hash diffs, so only
// differing rows travel, and live edits are relayed to every connected device.
export class DumpDO extends WsServerDurableObject<Env> {
  createPersister() {
    // Same prefix and mode as before, so existing SQLite data loads unchanged.
    return createDurableObjectSqlStoragePersister(
      newStore(),
      this.ctx.storage.sql,
      { mode: 'fragmented', storagePrefix: 'dump_' },
      undefined,
      (error) => this.onIgnoredError(error),
    );
  }

  getFragmentSize() {
    return SYNC_FRAGMENT_BYTES;
  }

  getRequestTimeoutSeconds() {
    return SYNC_TIMEOUT_SECONDS;
  }

  onIgnoredError(error: unknown) {
    console.error('Sync error:', error instanceof Error ? error.name : 'unknown');
  }
}
