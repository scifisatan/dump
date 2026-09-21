import { describe, expect, it } from 'vitest';
import {
  INBOX_CHOICE,
  classifyRequestSchema,
  jevRequest,
  readJevResponse,
} from '../src/shared/classify';

const request = {
  text: 'warm floor lamp for the reading corner',
  lists: [
    { id: 'buy', label: 'Buy' },
    { id: 'decor', label: 'Decor' },
  ],
};
const answer = (choice: string, confidence: number) => ({
  model: 'jev-1.13.0',
  answers: { list: { type: 'choice', choice, confidence, probabilities: {} } },
  usage: { input_tokens: 40, output_tokens: 1 },
});

describe('Jev classification', () => {
  it('offers each list by stable ID plus an inbox option', () => {
    const body = jevRequest(request);
    expect(body.state).toBe(request.text);
    expect(Object.keys(body.questions.list.criteria)).toEqual([INBOX_CHOICE, 'buy', 'decor']);
  });
  it('returns the chosen list with its confidence', () => {
    expect(readJevResponse(answer('decor', 0.91), request)).toEqual({
      list: 'decor',
      confidence: 0.91,
    });
  });
  it('treats the inbox choice or an unknown list as no filing', () => {
    expect(readJevResponse(answer(INBOX_CHOICE, 0.97), request)).toEqual({
      list: null,
      confidence: 0,
    });
    expect(readJevResponse(answer('deleted-list', 0.99), request).list).toBeNull();
  });
  it('is only asked when there are at least two lists to choose between', () => {
    expect(classifyRequestSchema.safeParse(request).success).toBe(true);
    expect(classifyRequestSchema.safeParse({ ...request, lists: [request.lists[0]] }).success).toBe(
      false,
    );
    expect(classifyRequestSchema.safeParse({ ...request, lists: [] }).success).toBe(false);
  });
  it('rejects malformed responses', () => {
    expect(() => readJevResponse({ answers: {} }, request)).toThrow();
  });
});
