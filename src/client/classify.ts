import { hc } from 'hono/client';
import type { Api } from '../shared/api';
import {
  CLASSIFY_TEXT_LIMIT,
  CLASSIFY_THRESHOLD,
  classifyRequestSchema,
  classifyResultSchema,
  type ClassifyRequest,
} from '../shared/classify';
import type { Collection, ListId } from '../shared/schema';

const api = hc<Api>('/');

export class ClassifyUnavailable extends Error {}

// What Jev would be asked about a dump, or null when there is nothing to judge (a bare link).
export function classifyRequest(text: string, lists: Collection[]): ClassifyRequest | null {
  if (!text.replace(/https?:\/\/\S+/gi, '').trim()) return null;
  const parsed = classifyRequestSchema.safeParse({
    text: text.slice(0, CLASSIFY_TEXT_LIMIT),
    lists: lists.filter((list) => !list.deleted).map(({ id, label }) => ({ id, label })),
  });
  return parsed.success ? parsed.data : null;
}

// Jev's list, or null when it is unsure. Throws on network or server failure so the caller
// can retry later; ClassifyUnavailable means this deployment has classification turned off.
export async function requestList(request: ClassifyRequest): Promise<ListId | null> {
  const response = await api.api.classify.$post(
    { json: request },
    { init: { signal: AbortSignal.timeout(10_000) } },
  );
  if (response.status === 503) throw new ClassifyUnavailable();
  if (!response.ok) throw new Error(`Classification failed: ${response.status}`);
  const result = classifyResultSchema.parse(await response.json());
  return result.confidence >= CLASSIFY_THRESHOLD ? result.list : null;
}
