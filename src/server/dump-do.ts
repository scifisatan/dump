import { Agent, type Connection } from 'agents';
import { createDurableObjectSqlStoragePersister } from 'tinybase/persisters/persister-durable-object-sql-storage';
import { MAX_SYNC_BYTES, mergeContent, newStore, validateContent } from '../shared/merge';
import { SCHEMA_VERSION } from '../shared/schema';
import type { Env } from './env';

export class DumpDO extends Agent<Env> {
  static options = { hibernate: true, sendIdentityOnConnect: false };
  private store = newStore();
  private persistenceError: unknown;
  private persister = createDurableObjectSqlStoragePersister(
    this.store, this.ctx.storage.sql, { mode: 'fragmented', storagePrefix: 'dump_' },
    undefined, (error) => { this.persistenceError = error; },
  );

  async onStart() {
    await this.persister.load();
    if (this.persistenceError) throw new Error('Could not load persisted dumps.');
  }

  onConnect(connection: Connection) {
    this.setConnectionReadonly(connection, true);
    connection.send(JSON.stringify({ type: 'changed' }));
  }

  async onRequest(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/ping') {
      return Response.json({ ok: true, items: this.store.getRowCount('dumps'), version: SCHEMA_VERSION });
    }
    if (path !== '/sync' || request.method !== 'POST') return new Response('Not found', { status: 404 });
    if (!request.headers.get('Content-Type')?.includes('application/json')) {
      return Response.json({ error: 'JSON required.' }, { status: 415 });
    }
    // Count actual streamed bytes instead of trusting Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return new Response('Body required', { status: 400 });
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SYNC_BYTES) {
        await reader.cancel();
        return Response.json({ error: 'Sync size limit reached. Export your data before continuing.' }, { status: 413 });
      }
      chunks.push(value);
    }
    let content;
    try {
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      content = validateContent(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      return Response.json({ error: 'Invalid or incompatible sync data.' }, { status: 400 });
    }
    return this.ctx.blockConcurrencyWhile(async () => {
      const before = this.store.getMergeableContentHashes().join(':');
      mergeContent(this.store, content);
      const changed = before !== this.store.getMergeableContentHashes().join(':');
      this.persistenceError = undefined;
      await this.persister.save();
      if (this.persistenceError) throw new Error('Could not save dumps.');
      // Only acknowledge and notify peers after persistence completes.
      if (changed) this.broadcast(JSON.stringify({ type: 'changed' }));
      return Response.json({ version: SCHEMA_VERSION, content: this.store.getMergeableContent() }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    });
  }
}
