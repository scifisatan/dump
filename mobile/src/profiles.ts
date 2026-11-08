import * as SecureStore from 'expo-secure-store';
import { profileRegistry } from '../../src/core/profiles';
import { setting } from './settings';

export const registry = profileRegistry(setting('dump-connections'));

// Owner keys stay in the Keychain or Keystore, whose key names allow letters, digits, ".", "-"
// and "_".
const keyName = (profileId: string) => `dump-owner-key.${profileId}`;
export const readKey = (profileId: string) => SecureStore.getItem(keyName(profileId));
export const saveKey = (profileId: string, key: string) =>
  SecureStore.setItem(keyName(profileId), key);
