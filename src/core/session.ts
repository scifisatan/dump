import { createDumpClient, type ClientPlatform } from './client';
import { verifyKey, type ServerLocation, type ServerProfile } from './connection';
import { deviceOnlyProfile, type ProfileRegistry } from './profiles';

export type Session = {
  id: number;
  profile: ServerProfile;
  client: ReturnType<typeof createDumpClient>;
  ready: Promise<void>;
  firstRun: boolean;
  openError: string | null;
};

export function createSession(host: {
  registry: ProfileRegistry;
  platform(profile: ServerProfile): ClientPlatform;
  saveKey(profileId: string, key: string, server: ServerLocation): void;
  reopen?(): void;
}) {
  let opened = 0;
  let current: Session | undefined;
  const listeners = new Set<() => void>();
  const publish = (session: Session) => {
    current = session;
    listeners.forEach((listener) => listener());
  };

  function open(profile: ServerProfile, firstRun = false): Session {
    const client = createDumpClient(host.platform(profile));
    const id = ++opened;
    const ready = client.start().catch((error: unknown) => {
      if (current?.id !== id) return;
      publish({
        ...session,
        openError: error instanceof Error ? error.message : 'Could not open your notebook.',
      });
    });
    const session: Session = { id, profile, client, ready, firstRun, openError: null };
    return session;
  }

  function launch() {
    const saved = host.registry.active();
    if (saved) return open(saved);
    const profile = deviceOnlyProfile();
    host.registry.activate(profile);
    return open(profile, true);
  }

  const get = () => (current ??= launch());

  async function switchTo(profile: ServerProfile) {
    const { client } = get();
    const restore = host.registry.activate(profile);
    try {
      await client.stop();
    } catch (error) {
      restore();
      throw error;
    }
    if (host.reopen) host.reopen();
    else publish(open(profile));
  }

  return {
    get,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    switchTo,
    async connect(server: ServerLocation, key: string, signal?: AbortSignal) {
      await verifyKey(server.baseUrl, key, signal);
      const next = host.registry.joining(get().profile, server);
      host.saveKey(next.id, key, next.server);
      await switchTo(next);
    },
    async signIn(key: string) {
      const { profile, client } = get();
      if (!profile.server) throw new Error('This notebook is kept only on this device.');
      await verifyKey(profile.server.baseUrl, key);
      host.saveKey(profile.id, key, profile.server);
      client.reconnect();
    },
  };
}
