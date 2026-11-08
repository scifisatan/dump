import Storage from 'expo-sqlite/kv-store';
import type { Setting } from '../../src/core/setting';

export const setting = (name: string): Setting => ({
  read: () => Storage.getItemSync(name),
  write: (value) =>
    value === null ? Storage.removeItemSync(name) : Storage.setItemSync(name, value),
});
