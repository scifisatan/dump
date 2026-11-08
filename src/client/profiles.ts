import { profileRegistry } from '../core/profiles';
import { REGISTRY_KEY } from './registry';

export const registry = profileRegistry({
  read: () => localStorage.getItem(REGISTRY_KEY),
  write: (value) =>
    value === null
      ? localStorage.removeItem(REGISTRY_KEY)
      : localStorage.setItem(REGISTRY_KEY, value),
});

const keyName = (profileId: string) => `dump-owner-key:${profileId}`;
export const readKey = (profileId: string) => localStorage.getItem(keyName(profileId));
export const saveKey = (profileId: string, key: string) =>
  localStorage.setItem(keyName(profileId), key);

export const reopen = () => location.assign('/');
