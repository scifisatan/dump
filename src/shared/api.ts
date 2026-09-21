import type { Hono } from 'hono';
import { z } from 'zod';
import type { ClassifyRequest, ClassifyResult } from './classify';

export const pingSchema = z.object({
  ok: z.boolean(),
  mode: z.enum(['local', 'cloud']),
  classify: z.boolean(),
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
            // 503 means classification is not configured on this deployment.
            status: 400 | 429 | 500 | 502 | 503;
          };
    };
  }
>;
