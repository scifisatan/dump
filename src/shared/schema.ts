import { z } from 'zod';

export const LISTS = [
  { id: 'ideas', label: 'Ideas', color: '#9b84d6' },
  { id: 'buy', label: 'Buy', color: '#c49651' },
  { id: 'watch', label: 'Watch', color: '#6395c3' },
  { id: 'decor', label: 'Decor', color: '#849c74' },
  { id: 'todo', label: 'To do', color: '#cd7f86' },
] as const;

export const listSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
export type ListId = z.infer<typeof listSchema>;

export const collectionSchema = z
  .object({
    id: listSchema,
    label: z.string().trim().min(1).max(40),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    position: z.number().finite(),
    deleted: z.boolean(),
  })
  .strict();
export type Collection = z.infer<typeof collectionSchema>;
export const DEFAULT_LISTS: Collection[] = LISTS.map((list, position) => ({
  id: list.id,
  label: list.label,
  color: list.color,
  position,
  deleted: false,
}));
export const encodeCollection = (list: Collection): string =>
  JSON.stringify(collectionSchema.parse(list));
export const decodeCollection = (data: unknown): Collection =>
  collectionSchema.parse(JSON.parse(z.string().parse(data)));

export const dumpSchema = z
  .object({
    id: z.uuid(),
    text: z.string().trim().min(1).max(20_000),
    list: listSchema.nullable(),
    tags: z.array(z.string().min(1).max(64)).max(30),
    url: z
      .url()
      .refine((url) => /^https?:\/\//i.test(url))
      .nullable(),
    done: z.boolean(),
    deleted: z.boolean(),
    created_at: z.number().int().nonnegative(),
    updated_at: z.number().int().nonnegative(),
    classified_by: z.enum(['user', 'ai']).nullable(),
  })
  .strict();
export type Dump = z.infer<typeof dumpSchema>;

// One atomic cell per dump prevents independently merged fields from splitting
// a user's filing decision from its provenance. TinyBase owns the HLC metadata.
export const storeSchema = {
  dumps: { data: { type: 'string' as const } },
  lists: { data: { type: 'string' as const } },
};
export const encodeDump = (dump: Dump): string => JSON.stringify(dumpSchema.parse(dump));
export const decodeDump = (data: unknown): Dump =>
  dumpSchema.parse(JSON.parse(z.string().parse(data)));

export const exportSchema = z.object({
  app: z.literal('dump'),
  exported_at: z.string(),
  dumps: z.array(dumpSchema).max(50_000),
  lists: z.array(collectionSchema).max(500),
});

export function makeDump(
  raw: string,
  id = crypto.randomUUID(),
  now = Date.now(),
  lists: Collection[] = DEFAULT_LISTS,
): Dump {
  let text = raw.trim();
  const prefix = text.match(/^!([a-z0-9-]+)(?:\s+|$)/i);
  const name = prefix?.[1].toLowerCase();
  const list =
    lists.find(
      (item) =>
        !item.deleted &&
        (item.id === name || item.label.toLowerCase().replace(/\s+/g, '-') === name),
    )?.id ?? null;
  if (list) text = text.slice(prefix![0].length).trim();
  const tags = [
    ...new Set(
      [...text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]{1,64})(?=\s|$|[,.!?])/gu)].map((match) =>
        match[1].toLowerCase(),
      ),
    ),
  ].slice(0, 30);
  const candidate = text.match(/https?:\/\/[^\s<>]+/i)?.[0].replace(/[),.!?;]+$/, '');
  let url: string | null = null;
  if (candidate) {
    try {
      url = new URL(candidate).href;
    } catch {
      /* Plain text remains intact. */
    }
  }
  return dumpSchema.parse({
    id,
    text,
    list,
    tags,
    url,
    done: false,
    deleted: false,
    created_at: now,
    updated_at: now,
    classified_by: list ? 'user' : null,
  });
}
