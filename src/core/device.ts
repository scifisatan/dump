import type { ClientPlatform } from './client';

export function deviceEvents() {
  type Watcher = { resume(): void; offline(): void; suspend(): void };
  const watchers = new Set<Watcher>();
  let online = true;
  return {
    isOnline: () => online,
    watch: ((resume, offline, suspend) => {
      const watcher = { resume, offline, suspend };
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    }) satisfies ClientPlatform['watch'],
    network(connected: boolean) {
      if (connected === online) return;
      online = connected;
      for (const watcher of watchers) (connected ? watcher.resume : watcher.offline)();
    },
    resume() {
      for (const watcher of watchers) watcher.resume();
    },
    suspend() {
      for (const watcher of watchers) watcher.suspend();
    },
  };
}
