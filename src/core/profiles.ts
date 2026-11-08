import { z } from 'zod';
import { profileSchema, type ServerLocation, type ServerProfile } from './connection';
import type { Setting } from './setting';

const registrySchema = z.object({
  active: z.string().nullable(),
  profiles: z.array(profileSchema),
});
type Registry = z.infer<typeof registrySchema>;

export const deviceOnlyProfile = (): ServerProfile => ({ id: crypto.randomUUID(), server: null });

export function profileRegistry(setting: Setting) {
  function read(): Registry {
    const raw = setting.read();
    return raw === null ? { active: null, profiles: [] } : registrySchema.parse(JSON.parse(raw));
  }
  const write = (registry: Registry) => setting.write(JSON.stringify(registry));
  return {
    active() {
      const registry = read();
      const profile = registry.profiles.find((item) => item.id === registry.active);
      if (registry.active && !profile) throw new Error('The saved server connection is invalid.');
      return profile;
    },
    others() {
      const registry = read();
      return registry.profiles.filter((profile) => profile.id !== registry.active);
    },
    activate(profile: ServerProfile) {
      const previous = read();
      write({
        active: profile.id,
        profiles: [...previous.profiles.filter((item) => item.id !== profile.id), profile],
      });
      return () => write(previous);
    },
    joining(current: ServerProfile | undefined, { baseUrl, instanceId }: ServerLocation) {
      const server = { baseUrl, instanceId };
      if (current && current.server === null) return { id: current.id, server };
      const saved = read().profiles.find(
        (item) => item.server?.baseUrl === baseUrl && item.server.instanceId === instanceId,
      );
      return { id: saved?.id ?? crypto.randomUUID(), server };
    },
  };
}
export type ProfileRegistry = ReturnType<typeof profileRegistry>;
