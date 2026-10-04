import { z } from 'zod';

export const instanceIdSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const pingSchema = z.object({
  ok: z.literal(true),
  app: z.literal('dump'),
  instanceId: instanceIdSchema,
  syncProtocol: z.literal('tinybase-ws'),
  // `unconfigured` servers have no usable OWNER_KEY yet and refuse everything else.
  auth: z.enum(['owner-key', 'unconfigured']),
  mode: z.enum(['local', 'cloud']),
  classify: z.boolean(),
});
export type PingResult = z.infer<typeof pingSchema>;
export const syncTicketSchema = z.object({ ticket: z.string().min(1) });
