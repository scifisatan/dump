import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { z } from 'zod';
import { profileSchema, type ServerLocation, type ServerProfile } from '../../src/core/connection';

// Saved notebooks, as on the web (src/client/profiles.ts): which one is open, and every notebook
// this phone keeps. Owner keys stay out of the registry, in the Keychain or Keystore.
const REGISTRY = 'dump-connections';
const registrySchema = z.object({
  active: z.string().nullable(),
  profiles: z.array(profileSchema),
});
type Registry = z.infer<typeof registrySchema>;

export function readProfiles(): Registry {
  const raw = Storage.getItemSync(REGISTRY);
  return raw === null ? { active: null, profiles: [] } : registrySchema.parse(JSON.parse(raw));
}

export function activeProfile() {
  const registry = readProfiles();
  const profile = registry.profiles.find((item) => item.id === registry.active);
  if (registry.active && !profile) throw new Error('The saved server connection is invalid.');
  return profile;
}

// Saves the profile and makes it the one opened at launch.
export function activate(profile: ServerProfile) {
  const registry = readProfiles();
  registry.profiles = [...registry.profiles.filter((item) => item.id !== profile.id), profile];
  registry.active = profile.id;
  Storage.setItemSync(REGISTRY, JSON.stringify(registry));
}

// Reuses the notebook already saved for this server and identity, if any.
export function profileForServer(server: ServerLocation, newId: () => string): ServerProfile {
  const existing = readProfiles().profiles.find(
    (item) =>
      item.server?.baseUrl === server.baseUrl && item.server.instanceId === server.instanceId,
  );
  return { id: existing?.id ?? newId(), server };
}

// Secure store keys allow letters, digits, ".", "-" and "_".
const keyName = (profileId: string) => `dump-owner-key.${profileId}`;
export const readKey = (profileId: string) => SecureStore.getItem(keyName(profileId));
export const saveKey = (profileId: string, key: string) =>
  SecureStore.setItem(keyName(profileId), key);
