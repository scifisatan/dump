import { describe, expect, it } from 'vite-plus/test';
import {
  channelName,
  databaseName,
  readServerInfo,
  serverUrl,
  syncUrl,
} from '../src/core/connection';
import { allowsOrigin } from '../src/server/origins';

const instanceId = 'a'.repeat(64);
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
  it('validates the server shape without API or schema versioning', () => {
    expect(
      readServerInfo({
        ok: true,
        app: 'dump',
        instanceId,
        syncProtocol: 'tinybase-ws',
        auth: 'owner-key',
        mode: 'cloud',
        classify: false,
      }).instanceId,
    ).toBe(instanceId);
    expect(() => readServerInfo({ ok: true })).toThrow('compatible Dump server');
  });
  it('pins the server identity and carries only a ticket on the WebSocket handshake', () => {
    const url = new URL(syncUrl('https://dump.example.com', instanceId, 'ticket'));
    expect(url.protocol).toBe('wss:');
    expect(url.pathname).toBe('/api/sync');
    expect(url.searchParams.get('instance')).toBe(instanceId);
    expect(url.searchParams.get('ticket')).toBe('ticket');
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
});
