import { randomUUID } from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { createDumpClient } from '../../src/core/client';
import {
  explainConnectionError,
  inspectServer,
  requestTicket,
  serverUrl,
  type ServerLocation,
  type ServerProfile,
} from '../../src/core/connection';
import type { PingResult } from '../../src/shared/api';
import { mobilePlatform } from './platform';
import { activate, activeProfile, profileForServer, saveKey } from './profiles';

export type Client = ReturnType<typeof createDumpClient>;
// The open notebook. `id` changes whenever a notebook is opened, even the same one again, so
// screens start over with it.
export type Session = {
  id: number;
  profile: ServerProfile;
  client: Client;
  // True until the first notebook was set up, to greet a new owner.
  firstRun: boolean;
  openError: string | null;
};

let opened = 0;
let current: Session | undefined;
const listeners = new Set<() => void>();
const publish = (session: Session) => {
  current = session;
  listeners.forEach((listener) => listener());
};

function open(profile: ServerProfile, firstRun = false): Session {
  const client = createDumpClient(mobilePlatform(profile));
  const session: Session = { id: ++opened, profile, client, firstRun, openError: null };
  client.start().catch((error: unknown) => {
    if (current?.id !== session.id) return;
    publish({
      ...session,
      openError: error instanceof Error ? error.message : 'Could not open your notebook.',
    });
  });
  return session;
}

// Opens the saved notebook, or starts one on this phone so capture works right away.
function launch() {
  const saved = activeProfile();
  if (saved) return open(saved);
  const profile: ServerProfile = { id: randomUUID(), server: null };
  activate(profile);
  return open(profile, true);
}

const session = () => (current ??= launch());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useSession = () => useSyncExternalStore(subscribe, session);

export function useSnapshot() {
  const { client } = useSession();
  return useSyncExternalStore(client.subscribe, client.getSnapshot);
}

// Closes the open notebook, saving it (a failed save throws and keeps it open), then opens another.
export async function switchTo(profile: ServerProfile) {
  await session().client.stop();
  activate(profile);
  publish(open(profile));
}

// What /api/ping says about an address, checked before anything is saved.
export type ServerCheck = ServerLocation & Pick<PingResult, 'auth' | 'classify'>;

export async function inspect(address: string): Promise<ServerCheck> {
  try {
    const baseUrl = serverUrl(address);
    const info = await inspectServer(baseUrl);
    return { baseUrl, instanceId: info.instanceId, auth: info.auth, classify: info.classify };
  } catch (cause) {
    throw new Error(explainConnectionError(cause, 'Could not check this server.'), { cause });
  }
}

async function verify(baseUrl: string, key: string) {
  try {
    await requestTicket(baseUrl, key);
  } catch (cause) {
    throw new Error(explainConnectionError(cause, 'Could not connect to this server.'), { cause });
  }
}

// A notebook on this phone joins the server's (its notes are added there). A synced one switches
// to that server's own notebook, reusing a saved one for it.
export async function connect(check: ServerLocation, key: string) {
  await verify(check.baseUrl, key);
  const server = { baseUrl: check.baseUrl, instanceId: check.instanceId };
  const { profile } = session();
  const next =
    profile.server === null ? { id: profile.id, server } : profileForServer(server, randomUUID);
  saveKey(next.id, key);
  await switchTo(next);
}

// After the owner key changed on the server: check the new one, then sync again.
export async function signIn(key: string) {
  const { profile, client } = session();
  if (!profile.server) return;
  await verify(profile.server.baseUrl, key);
  saveKey(profile.id, key);
  client.reconnect();
}
