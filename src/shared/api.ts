import type { Hono } from 'hono';
import { z } from 'zod';
import type { ClassifyRequest, ClassifyResult } from './classify';

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
// A browser-safe contract: importing Worker implementation types would pull the
// Workers runtime globals into the DOM compilation. No server runtime is bundled.
export type Api = Hono<
  Record<string, never>,
  {
    '/api/ping': {
      $get: { input: Record<string, never>; output: PingResult; outputFormat: 'json'; status: 200 };
    };
    '/api/classify': {
      $post:
        | {
            input: { json: ClassifyRequest };
            output: ClassifyResult;
            outputFormat: 'json';
            status: 200;
          }
        | {
            input: { json: ClassifyRequest };
            output: { error: string };
            outputFormat: 'json';
            // 401 means the owner key is wrong; 503 means classification is off on this server.
            status: 400 | 401 | 429 | 500 | 502 | 503;
          };
    };
  }
>;
