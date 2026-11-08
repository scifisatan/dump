import { useSyncExternalStore } from 'react';
import { createSession } from '../../src/core/session';
import { mobilePlatform } from './platform';
import { registry, saveKey } from './profiles';

const session = createSession({
  registry,
  platform: mobilePlatform,
  saveKey,
});
export const { switchTo, connect, signIn } = session;

export const useSession = () => useSyncExternalStore(session.subscribe, session.get);

export function useSnapshot() {
  const { client } = useSession();
  return useSyncExternalStore(client.subscribe, client.getSnapshot);
}
