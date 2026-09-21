import type { Hono } from 'hono';
import { z } from 'zod';

export const pingSchema = z.object({
  ok: z.boolean(),
  mode: z.enum(['local', 'cloud']),
});
export type PingResult = z.infer<typeof pingSchema>;
// A browser-safe contract: importing Worker implementation types would pull the
// Workers runtime globals into the DOM compilation. No server runtime is bundled.
export type Api = Hono<
  Record<string, never>,
  {
    '/api/ping': {
      $get: { input: Record<string, never>; output: PingResult; outputFormat: 'json'; status: 200 };
    };
  }
>;
