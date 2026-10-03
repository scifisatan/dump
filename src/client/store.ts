import { useSyncExternalStore } from 'react';
import { createDumpClient } from '../core/client';
import { browserPlatform } from './browser-platform';
import { activeProfile } from './profiles';

const profile = activeProfile();
if (!profile) throw new Error('Set up a notebook before opening one.');
export const currentProfile = profile;
export const client = createDumpClient(browserPlatform(profile));
// A device-only notebook has no other copy, so ask the browser not to evict it. Safari
// otherwise clears site data after seven days without a visit unless the app is installed.
if (!profile.server) void navigator.storage?.persist?.().catch(() => false);
export const useDumpStore = () => useSyncExternalStore(client.subscribe, client.getSnapshot);
export const initializeStore = client.start;
export const {
  capture,
  updateDump,
  saveList,
  deleteList,
  clearDone,
  importDumps,
  syncNow,
  reconnect,
} = client;

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
