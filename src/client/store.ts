import { useSyncExternalStore } from 'react';
import { createSession } from '../core/session';
import { browserPlatform } from './browser-platform';
import { registry, reopen, saveKey } from './profiles';

if (!registry.active()) throw new Error('Set up a notebook before opening one.');
export const session = createSession({
  registry,
  platform: browserPlatform,
  saveKey,
  reopen,
});
const { profile, client } = session.get();
export { client };
export const currentProfile = profile;
// A device-only notebook has no other copy, so ask the browser not to evict it. Safari
// otherwise clears site data after seven days without a visit unless the app is installed.
if (!profile.server) void navigator.storage?.persist?.().catch(() => false);
export const useDumpStore = () => useSyncExternalStore(client.subscribe, client.getSnapshot);

export function exportDumps() {
  const blob = new Blob([JSON.stringify(client.backup(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `dump-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
