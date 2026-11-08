import { createServer } from 'node:http';
import { describe, expect, it } from 'vite-plus/test';
import {
  channelName,
  checkServer,
  databaseName,
  serverUrl,
  verifyKey,
} from '../src/core/connection';
import { originSetting } from '../src/core/origin';
import { profileRegistry } from '../src/core/profiles';
import { allowsOrigin } from '../src/server/origins';

const instanceId = 'a'.repeat(64);

// A server on a free local port that answers every request with `status` and `body`.
async function serve(status: number, body = '') {
  const server = createServer((_request, response) => response.writeHead(status).end(body));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The test server has no port.');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

describe('personal server connections', () => {
  it('accepts HTTPS origins and localhost development without ambiguous URLs', () => {
    expect(serverUrl(' https://Dump.example.com/ ')).toBe('https://dump.example.com');
    expect(serverUrl('http://localhost:6191')).toBe('http://localhost:6191');
    for (const url of [
      'http://example.com',
      'https://user:pass@example.com',
      'https://example.com/path',
      'https://example.com/?text=private',
      'javascript:alert(1)',
    ])
      expect(() => serverUrl(url)).toThrow();
  });
  it('finds a Dump server by its ping, without API or schema versioning', async () => {
    const ping = {
      ok: true,
      app: 'dump',
      instanceId,
      syncProtocol: 'tinybase-ws',
      auth: 'owner-key',
      mode: 'local',
      classify: false,
    };
    const dump = await serve(200, JSON.stringify(ping));
    const other = await serve(200, JSON.stringify({ ok: true }));
    try {
      expect(await checkServer(dump.baseUrl)).toEqual({
        baseUrl: dump.baseUrl,
        instanceId,
        auth: 'owner-key',
        classify: false,
      });
      await expect(checkServer(other.baseUrl)).rejects.toThrow('compatible Dump server');
    } finally {
      await dump.close();
      await other.close();
    }
  });
  it('gives each notebook its own storage and tab channel', () => {
    const one = {
      id: crypto.randomUUID(),
      server: { baseUrl: 'https://a.example.com', instanceId },
    };
    const other = { id: crypto.randomUUID(), server: null };
    expect(databaseName(other)).not.toBe(databaseName(one));
    expect(channelName(other)).not.toBe(channelName(one));
  });
  it('allows only listed client origins, without treating CORS as authentication', () => {
    const client = 'https://app.example.com';
    expect(allowsOrigin(client, client)).toBe(true);
    expect(allowsOrigin(client, `https://other.example.com, ${client}`)).toBe(true);
    expect(allowsOrigin(undefined, client)).toBe(false);
    expect(allowsOrigin(client)).toBe(false);
    expect(allowsOrigin('null', '*')).toBe(false);
    expect(allowsOrigin(client, `${client}/path`)).toBe(false);
    expect(allowsOrigin(`${client}.evil.com`, client)).toBe(false);
    expect(allowsOrigin('http://example.com', 'http://example.com')).toBe(false);
  });
  it('explains connection failures the same way on every client', async () => {
    const gone = await serve(200);
    await gone.close();
    await expect(checkServer(gone.baseUrl)).rejects.toThrow(
      /^Could not reach this server\..*ALLOWED_CLIENT_ORIGINS/,
    );
    await expect(checkServer('https://dump.example.com/app')).rejects.toThrow('without a path');
    const wrongKey = await serve(401);
    // A native client reads a refused origin's 403 that a browser cannot.
    const refused = await serve(403);
    try {
      await expect(verifyKey(wrongKey.baseUrl, 'key')).rejects.toThrow('doesn’t match this server');
      const message = 'does not allow the web app address this app presents';
      await expect(checkServer(refused.baseUrl)).rejects.toThrow(message);
      await expect(verifyKey(refused.baseUrl, 'key')).rejects.toThrow(message);
    } finally {
      await wrongKey.close();
      await refused.close();
    }
  });

  it('joins a device-only notebook to a server, and reuses the notebook saved for one', () => {
    let saved: string | null = null;
    const registry = profileRegistry({ read: () => saved, write: (value) => (saved = value) });
    const server = { baseUrl: 'https://dump.example.com', instanceId: 'a'.repeat(64) };
    const device = { id: crypto.randomUUID(), server: null };
    registry.activate(device);
    const joined = registry.joining(device, { ...server, auth: 'owner-key', classify: true });
    expect(joined).toEqual({ id: device.id, server });
    registry.activate(joined)();
    expect(registry.active()).toEqual(device);
    const synced = registry.joining(undefined, server);
    registry.activate(synced);
    const other = { id: crypto.randomUUID(), server: { ...server, instanceId: 'b'.repeat(64) } };
    const restore = registry.activate(other);
    expect(registry.joining(other, server)).toEqual(synced);
    restore();
    expect(registry.active()).toEqual(synced);
    expect(registry.others()).toEqual([device]);
  });

  it('presents the hosted app, the dev client for localhost, or the owner’s chosen origin', () => {
    let saved: string | null = null;
    const origin = originSetting({ read: () => saved, write: (value) => (saved = value) });
    const hosted = 'https://dump.abishrestha.com.np';
    expect(origin.for('https://dump-api.example.com/api/ping')).toBe(hosted);
    expect(origin.standard(undefined)).toBe(hosted);
    expect(origin.for('http://localhost:6190/api/ping')).toBe('http://localhost:6191');
    expect(origin.choose(' https://Dump.Example.com/ ')).toBe('https://dump.example.com');
    expect(origin.for('http://localhost:6190/api/ping')).toBe('https://dump.example.com');
    expect(() => origin.choose('https://dump.example.com/app')).toThrow('without a path');
    expect(() => origin.choose('ftp://dump.example.com')).toThrow();
    expect(origin.choose('')).toBeNull();
    expect(saved).toBeNull();
  });
});
