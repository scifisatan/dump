import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFilePersister } from 'tinybase/persisters/persister-file';
import type { ClientPlatform } from '../src/core/client';
import type { ServerProfile } from '../src/core/connection';
import { deviceEvents } from '../src/core/device';
import { originSetting } from '../src/core/origin';
import { createServerLink } from '../src/core/server-link';
import type { Setting } from '../src/core/setting';

// A device is a folder: its notebooks as TinyBase JSON files (the format the Mac app writes),
// settings.json for the registry and web app origin, and keys.json for owner keys in plain text.
// It is a development tool; never point it at a folder you can't afford to lose.
export function nodeDevice(folder: string) {
  mkdirSync(folder, { recursive: true });
  const json = (name: string) => {
    const path = join(folder, name);
    const read = (): Map<string, string> =>
      new Map(existsSync(path) ? Object.entries(JSON.parse(readFileSync(path, 'utf8'))) : []);
    return {
      get: (key: string) => read().get(key) ?? null,
      set(key: string, value: string | null) {
        const values = read();
        if (value === null) values.delete(key);
        else values.set(key, value);
        writeFileSync(path, `${JSON.stringify(Object.fromEntries(values), null, 2)}\n`);
      },
    };
  };
  const settings = json('settings.json');
  const keys = json('keys.json');
  const setting = (name: string): Setting => ({
    read: () => settings.get(name),
    write: (value) => settings.set(name, value),
  });
  const origin = originSetting(setting('webAppOrigin'));
  const events = deviceEvents();

  // Servers answer only allowed web app origins, so present one as the Mac and phone apps do.
  const send = globalThis.fetch;
  const api = (url: string) => new URL(url).pathname.startsWith('/api/');
  globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!api(url)) return send(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
    headers.set('Origin', origin.for(url));
    return send(input, { ...init, headers });
  };
  const NodeWebSocket = globalThis.WebSocket;
  class OriginWebSocket extends NodeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const href = String(url);
      // SAFETY: Node's WebSocket (undici) takes `headers` beside `protocols`, which the DOM types
      // don't describe.
      super(href, {
        protocols,
        headers: api(href) ? { Origin: origin.for(href) } : {},
      } as unknown as string[]);
    }
  }
  globalThis.WebSocket = OriginWebSocket;

  const file = (profile: ServerProfile) => join(folder, `${profile.id}.json`);
  const platform = (profile: ServerProfile): ClientPlatform => ({
    storage: (store, onError) => ({
      persister: createFilePersister(store, file(profile), onError),
      isEmpty: async () => !existsSync(file(profile)),
    }),
    storageFailure: `Could not save ${file(profile)}.`,
    server: profile.server && createServerLink(profile.server, () => keys.get(profile.id)),
    isOnline: events.isOnline,
    watch: events.watch,
  });

  return {
    setting,
    origin,
    platform,
    saveKey: (profileId: string, key: string) => keys.set(profileId, key),
  };
}
