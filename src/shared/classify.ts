import { z } from 'zod';
import { listSchema } from './schema';

// Only this much of a dump is sent to Jev; list choice rarely depends on the tail.
export const CLASSIFY_TEXT_LIMIT = 2_000;
// Below this confidence the dump defaults to To do. Tune it against labelled dumps.
export const CLASSIFY_THRESHOLD = 0.4;
// Jev can decline to pick a list instead of forcing one; the dump then defaults to To do.
export const INBOX_CHOICE = 'leave_in_inbox';

export const classifyRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(CLASSIFY_TEXT_LIMIT),
    lists: z
      .array(z.object({ id: listSchema, label: z.string().trim().min(1).max(40) }).strict())
      // Jev is only asked when there is a real choice between lists.
      .min(2)
      .max(500),
  })
  .strict();
export type ClassifyRequest = z.infer<typeof classifyRequestSchema>;

export const classifyResultSchema = z
  .object({
    list: listSchema.nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type ClassifyResult = z.infer<typeof classifyResultSchema>;

export function jevRequest({ text, lists }: ClassifyRequest) {
  const criteria: Record<string, string> = {
    [INBOX_CHOICE]: 'None of the lists clearly fits, or the note is too vague to file.',
  };
  for (const list of lists) criteria[list.id] = `The "${list.label}" list.`;
  return {
    model: 'jev-latest',
    state: text,
    questions: {
      list: {
        type: 'choice',
        instructions:
          'This is a quick note someone captured in a personal notebook. Which list should it be filed in?',
        criteria,
      },
    },
  };
}

const jevResponseSchema = z.object({
  answers: z.object({
    list: z.object({ choice: z.string(), confidence: z.number().min(0).max(1) }),
  }),
});

// Jev's output is constrained to the offered keys, but a list could be deleted mid-request,
// so the answer is checked against the lists that were actually sent.
export function readJevResponse(body: unknown, request: ClassifyRequest): ClassifyResult {
  const { choice, confidence } = jevResponseSchema.parse(body).answers.list;
  const list = request.lists.some((item) => item.id === choice) ? choice : null;
  return classifyResultSchema.parse({ list, confidence: list ? confidence : 0 });
}
