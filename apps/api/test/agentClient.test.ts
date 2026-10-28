import { describe, expect, it } from 'vitest';
import { AGENT_TIMEOUT_MS, MAX_MODEL_CALLS, askAgents, type AgentRequest } from '../src/agentClient.js';

const STEP = { agent: 'writer', action: 'draft', detail: 'Drafted from the evidence.', ok: true };
const request: AgentRequest = {
  request_id: 'req-1',
  question: 'How many goals has Youngho Go scored?',
  template_answer: 'Youngho Go: 1 in this match so far (12′).',
  evidence: [{ ref: 'template', label: 'Verified template answer', text: 'Youngho Go: 1 in this match so far (12′).' }],
  max_model_calls: MAX_MODEL_CALLS,
  timeout_ms: AGENT_TIMEOUT_MS
};
const validResult = { request_id: 'req-1', answer: 'Youngho Go has 1 goal in this match.', engine: 'agents', outcome: 'ok', model_calls: 2, steps: [STEP] };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

describe('askAgents', () => {
  it('posts the request to the service and returns its parsed answer', async () => {
    // Arrange
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return json(validResult);
    }) as unknown as typeof fetch;

    // Act
    const result = await askAgents('http://agents.test', request, fetchImpl);

    // Assert
    expect(result).toEqual(validResult);
    expect(calls[0].url).toBe('http://agents.test/ask');
    expect(calls[0].init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' } });
    expect(JSON.parse(calls[0].init.body as string)).toEqual(request);
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['the service answers with an HTTP error', () => new Response('down', { status: 503 })],
    ['the body is not JSON', () => new Response('<html>', { status: 200 })],
    ['the connection fails', () => { throw new TypeError('fetch failed'); }],
    ['the deadline passes', () => { throw new DOMException('The operation timed out.', 'TimeoutError'); }],
    ['the request id does not match', () => json({ ...validResult, request_id: 'req-other' })],
    ['the engine is unknown', () => json({ ...validResult, engine: 'llm' })],
    ['the outcome is unknown', () => json({ ...validResult, outcome: 'great' })],
    ['the answer is missing', () => json({ ...validResult, answer: undefined })],
    ['the model call count is not a whole number', () => json({ ...validResult, model_calls: 1.5 })],
    ['a step has no ok flag', () => json({ ...validResult, steps: [{ agent: 'writer', action: 'draft', detail: 'x' }] })],
    ['steps are not a list', () => json({ ...validResult, steps: 'draft' })]
  ])('returns null when %s', async (_case, reply) => {
    // Arrange
    const fetchImpl = (async () => reply()) as unknown as typeof fetch;

    // Act and assert
    expect(await askAgents('http://agents.test', request, fetchImpl)).toBeNull();
  });
});
