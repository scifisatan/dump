import { z } from 'zod';
import { profileSchema, type ServerLocation, type ServerProfile } from '../core/connection';
import { REGISTRY_KEY } from './registry';

const registrySchema = z.object({
  active: z.string().nullable(),
  profiles: z.array(profileSchema),
});

export function readProfiles(): z.infer<typeof registrySchema> {
  const raw = localStorage.getItem(REGISTRY_KEY);
  // Nothing is saved until a visitor connects a server or chooses this device only.
  return raw === null ? { active: null, profiles: [] } : registrySchema.parse(JSON.parse(raw));
}

export function activeProfile() {
  const registry = readProfiles();
  const profile = registry.profiles.find((item) => item.id === registry.active);
  if (registry.active && !profile) throw new Error('The saved server connection is invalid.');
  return profile;
}

// Reuses the notebook already saved for this server and identity, if any.
export function profileForServer(server: ServerLocation): ServerProfile {
  const existing = readProfiles().profiles.find(
    (item) =>
      item.server?.baseUrl === server.baseUrl && item.server.instanceId === server.instanceId,
  );
  return { id: existing?.id ?? crypto.randomUUID(), server };
}

export const deviceOnlyProfile = (): ServerProfile => ({ id: crypto.randomUUID(), server: null });

// Owner keys stay out of the registry: secret storage is the platform's concern.
const keyName = (profileId: string) => `dump-owner-key:${profileId}`;
export const readKey = (profileId: string) => localStorage.getItem(keyName(profileId));
export const saveKey = (profileId: string, key: string) =>
  localStorage.setItem(keyName(profileId), key);

export async function activateProfile(profile: ServerProfile, stop: () => Promise<void>) {
  const registry = readProfiles();
  const previous = registry.active;
  registry.profiles = [...registry.profiles.filter((item) => item.id !== profile.id), profile];
  registry.active = profile.id;
  // Verify settings can be persisted before closing the current notebook.
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  try {
    await stop();
  } catch (error) {
    const latest = readProfiles();
    latest.active = previous;
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(latest));
    throw error;
  }
  // A document navigation also clears view, search, and draft state from the old notebook.
  location.assign('/');
}
