import {
  CLASSIFY_TEXT_LIMIT,
  CLASSIFY_THRESHOLD,
  classifyRequestSchema,
  classifyResultSchema,
  type ClassifyRequest,
} from '../shared/classify';
import type { Collection, ListId } from '../shared/schema';
import { ownerKeyHeaders, serverUrl, Unauthorized } from './connection';

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
export async function requestList(
  baseUrl: string,
  key: string,
  request: ClassifyRequest,
  signal: AbortSignal,
): Promise<ListId | null> {
  const response = await fetch(`${serverUrl(baseUrl)}/api/classify`, {
    method: 'POST',
    headers: { ...ownerKeyHeaders(key), 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    credentials: 'omit',
    redirect: 'error',
  });
  if (response.status === 401) throw new Unauthorized('The owner key no longer works.');
  if (response.status === 503) throw new ClassifyUnavailable();
  if (!response.ok) throw new Error(`Classification failed: ${response.status}`);
  const result = classifyResultSchema.parse(await response.json());
  return result.confidence >= CLASSIFY_THRESHOLD ? result.list : null;
}
