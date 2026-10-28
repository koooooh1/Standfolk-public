import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { buildApp, type AgentOptions } from '../src/app.js';
import type { AgentRequest } from '../src/agentClient.js';
import { loadCatalog } from '../src/catalog.js';

const app = buildApp(loadCatalog(fileURLToPath(new URL('../../../data/catalog', import.meta.url))));
const ask = async (payload: unknown) => {
  const res = await app.inject({ method: 'POST', url: '/api/ask', payload: payload as object });
  return { status: res.statusCode, body: res.json() };
};
const MIN = 60_000;

describe('Ask (template engine)', () => {
  it('answers a player question from match events and season records, with sources', async () => {
    const { status, body } = await ask({ question: 'How many goals has Youngho Go scored?', at_ms: 20 * MIN });
    expect(status).toBe(200);
    expect(body.payload).toMatchObject({ answered: true, engine: 'template', subject: { kind: 'player', id: 'p-go' } });
    expect(body.payload.answer).toMatch(/1 in this match so far \(12′\)/);
    expect(body.payload.sources.map((s: { ref: string }) => s.ref)).toEqual([`events@${20 * MIN}`, 'stats:p-go']);
  });

  it('never uses events after the clock', async () => {
    const { body } = await ask({ question: 'What is the score?', at_ms: 30 * MIN });
    expect(body.payload.answer).toBe('Vellmouth Rovers 1, Kestrin Athletic 0. Goals: Youngho Go 12′.');
    expect((await ask({ question: 'score?', at_ms: 0 })).body.payload.answer).toMatch(/not started/);
  });

  it('uses the panel subject and answers pronunciation', async () => {
    const { body } = await ask({ question: 'How do you say his name?', subject: { kind: 'player', id: 'p-go' } });
    expect(body.payload.answer).toBe('Say it YUNG-hoh GOH. Native spelling: 고영호.');
  });

  it('does not guess between two players with the same surname', async () => {
    const { body } = await ask({ question: 'How old is Penn?' });
    expect(body.payload).toMatchObject({ answered: false, subject: null });
  });

  it('answers about a club and admits what it cannot answer', async () => {
    expect((await ask({ question: 'When was Kestrin Athletic founded?' })).body.payload.answer).toBe('Kestrin Athletic were founded in 1902.');
    expect((await ask({ question: 'Will it rain?' })).body.payload.answered).toBe(false);
  });

  it('rejects invalid requests', async () => {
    for (const bad of [{}, { question: '' }, { question: 'x'.repeat(301) }, { question: 'score', at_ms: -1 }, { question: 'score', at_ms: 1.5 }, { question: 'score', subject: { kind: 'player', id: 'nobody' } }]) {
      const { status, body } = await ask(bad);
      expect(status).toBe(400);
      expect(body.error.code).toBe('bad_request');
    }
  });
});

describe('Ask with the agent service', () => {
  const catalog = loadCatalog(fileURLToPath(new URL('../../../data/catalog', import.meta.url)));
  const AGENTS_URL = 'http://agents.test';
  const STEP = { agent: 'writer', action: 'draft', detail: 'Drafted from the evidence.', ok: true };
  const TEMPLATE = 'Youngho Go: 1 in this match so far (12′), and 5 in 6 league games this season before today.';
  // Studio requests have template answers reworded; fans get template answers without a model call.
  const PLAYER = { question: 'How many goals has Youngho Go scored?', at_ms: 20 * MIN, studio: true };

  // Fake agent service: records each request it receives and answers with reply(request).
  function service(reply: (request: AgentRequest) => Response) {
    const requests: AgentRequest[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const request = JSON.parse(init.body as string) as AgentRequest;
      requests.push(request);
      return reply(request);
    }) as unknown as typeof fetch;
    return { requests, fetchImpl };
  }
  const agentReply = (answer: string, fields: Record<string, unknown> = {}) => (request: AgentRequest) =>
    new Response(JSON.stringify({ request_id: request.request_id, answer, engine: 'agents', outcome: 'ok', model_calls: 2, steps: [STEP], ...fields }), { headers: { 'content-type': 'application/json' } });
  const askWith = async (agents: AgentOptions, payload: object) => {
    const res = await buildApp(catalog, undefined, agents).inject({ method: 'POST', url: '/api/ask', payload });
    return res.json().payload;
  };

  it('uses a verified agent answer and reports its steps', async () => {
    const { requests, fetchImpl } = service(agentReply('Youngho Go has 1 goal in this match so far (12′).'));
    const payload = await askWith({ agentsUrl: AGENTS_URL, fetchImpl }, PLAYER);
    expect(payload).toMatchObject({ answered: true, engine: 'agents', answer: 'Youngho Go has 1 goal in this match so far (12′).' });
    expect(payload.agent).toEqual({ outcome: 'ok', model_calls: 2, steps: [STEP] });
    expect(requests).toHaveLength(1);
  });

  it('keeps the template answer when the agent adds a figure the template lacks', async () => {
    const { fetchImpl } = service(agentReply('Youngho Go has 999 goals this season.'));
    const payload = await askWith({ agentsUrl: AGENTS_URL, fetchImpl }, PLAYER);
    expect(payload).toMatchObject({ engine: 'template', answer: TEMPLATE, agent: { outcome: 'rejected_by_api', model_calls: 2 } });
  });

  it.each([
    ['a spelled-out figure', 'Youngho Go has scored twice today.'],
    ['a name the template lacks', 'Youngho Go scored after a pass from Arlo Penn.']
  ])('keeps the template answer when the agent adds %s', async (_case, text) => {
    const { fetchImpl } = service(agentReply(text));
    const payload = await askWith({ agentsUrl: AGENTS_URL, fetchImpl }, PLAYER);
    expect(payload).toMatchObject({ engine: 'template', answer: TEMPLATE, agent: { outcome: 'rejected_by_api' } });
  });

  it('rejects an empty agent answer', async () => {
    const { fetchImpl } = service(agentReply('   '));
    const payload = await askWith({ agentsUrl: AGENTS_URL, fetchImpl }, PLAYER);
    expect(payload).toMatchObject({ engine: 'template', answer: TEMPLATE, agent: { outcome: 'rejected_by_api' } });
  });

  it('matches a figure with a thousands separator against the plain figure', async () => {
    const { fetchImpl } = service(agentReply('Vellmouth Rovers play at Quayside Park (capacity 31400).'));
    const payload = await askWith({ agentsUrl: AGENTS_URL, fetchImpl }, { question: 'Where do Vellmouth Rovers play?', studio: true });
    expect(payload).toMatchObject({ engine: 'agents', answer: 'Vellmouth Rovers play at Quayside Park (capacity 31400).' });
  });

  it('keeps the template answer when the service did not finish with outcome ok', async () => {
    const { fetchImpl } = service(agentReply('Youngho Go has 1 goal in this match so far (12′).', { outcome: 'rejected' }));
    const payload = await askWith({ agentsUrl: AGENTS_URL, fetchImpl }, PLAYER);
    expect(payload).toMatchObject({ engine: 'template', answer: TEMPLATE, agent: { outcome: 'rejected', model_calls: 2 } });
  });

  it('reports the service fallback and keeps the template answer', async () => {
    const { fetchImpl } = service(agentReply('Unused.', { engine: 'template', outcome: 'no_model', model_calls: 0 }));
    const payload = await askWith({ agentsUrl: AGENTS_URL, fetchImpl }, PLAYER);
    expect(payload).toMatchObject({ engine: 'template', answer: TEMPLATE, agent: { outcome: 'no_model', model_calls: 0 } });
  });

  it.each([
    ['is unreachable', () => { throw new TypeError('fetch failed'); }],
    ['times out', () => { throw new DOMException('The operation timed out.', 'TimeoutError'); }],
    ['returns an HTTP error', () => new Response('boom', { status: 500 })],
    ['returns invalid JSON', () => new Response('{', { status: 200 })]
  ])('falls back to the template when the service %s', async (_case, reply) => {
    const fetchImpl = (async () => reply()) as unknown as typeof fetch;
    const payload = await askWith({ agentsUrl: AGENTS_URL, fetchImpl }, PLAYER);
    expect(payload).toMatchObject({ answered: true, engine: 'template', answer: TEMPLATE, agent: null });
  });

  it('sends the template answer and its sources as the evidence', async () => {
    const { requests, fetchImpl } = service(agentReply(TEMPLATE));
    await askWith({ agentsUrl: AGENTS_URL, fetchImpl }, PLAYER);
    expect(requests[0]).toMatchObject({
      request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      question: PLAYER.question,
      template_answer: TEMPLATE,
      max_model_calls: 4,
      timeout_ms: 15_000,
      evidence: [
        { ref: 'events@1200000', label: 'Synthetic match events up to 20′', text: 'Synthetic match events up to 20′' },
        { ref: 'stats:p-go', label: 'Season statistics (seeded world pack)', text: 'Season statistics (seeded world pack)' }
      ]
    });
  });

  it('never calls the service when no world-pack passage matches an unanswerable question', async () => {
    const { requests, fetchImpl } = service(agentReply('Yes.'));
    const payload = await askWith({ agentsUrl: AGENTS_URL, fetchImpl }, { question: 'Will it rain?' });
    expect(payload).toMatchObject({ answered: false, engine: 'template', agent: null });
    expect(requests).toHaveLength(0);
  });

  it('answers a fan from the template without calling the service', async () => {
    const { requests, fetchImpl } = service(agentReply('Unused.'));
    const payload = await askWith({ agentsUrl: AGENTS_URL, fetchImpl }, { ...PLAYER, studio: false });
    expect(payload).toMatchObject({ answered: true, engine: 'template', answer: TEMPLATE, agent: null });
    expect(requests).toHaveLength(0);
  });

  const CULTURE = { question: 'What happens after a home goal at Quayside Park?' };
  const BELL = 'After each home goal, the north stand rings the old harbour bell three times.';

  it('answers a question the templates cannot answer from retrieved world-pack passages, writer only', async () => {
    const { requests, fetchImpl } = service(agentReply(BELL, { model_calls: 1 }));
    const payload = await askWith({ agentsUrl: AGENTS_URL, fetchImpl }, CULTURE);
    expect(requests[0]).toMatchObject({ grounding: 'evidence', critic: false, max_model_calls: 2 });
    expect(requests[0].evidence.map((e) => e.ref)).toContain('club:vr:culture:0');
    expect(payload).toMatchObject({ answered: true, engine: 'agents', answer: BELL, agent: { outcome: 'ok', model_calls: 1 } });
    expect(payload.sources).toContainEqual({ ref: 'club:vr:culture:0', label: 'Vellmouth Rovers: club culture' });
    // Retrieved but unused passages (the ground opening, the club record) are not listed as sources.
    const refs = payload.sources.map((s: { ref: string }) => s.ref);
    expect(refs).not.toContain('club:vr:history:2');
    expect(refs).not.toContain('club:vr');
    expect(refs.length).toBeLessThan(requests[0].evidence.length);
  });

  it('refuses a retrieved-passage answer with a figure no passage has', async () => {
    const { fetchImpl } = service(agentReply('The north stand rings the bell 99 times.'));
    const payload = await askWith({ agentsUrl: AGENTS_URL, fetchImpl }, CULTURE);
    expect(payload).toMatchObject({ answered: false, engine: 'template', agent: { outcome: 'rejected_by_api' } });
  });

  it('stops calling the service once the daily budget is spent, and refunds calls a run did not use', async () => {
    // Budget 6: a run reserves 4 and uses 2, so two runs fit (2 + 4) and the third (4 + 4) does not.
    const { requests, fetchImpl } = service(agentReply('Youngho Go has 1 goal in this match so far (12′).'));
    const app = buildApp(catalog, undefined, { agentsUrl: AGENTS_URL, fetchImpl, dailyModelCalls: 6 });
    const run = async () => (await app.inject({ method: 'POST', url: '/api/ask', payload: PLAYER })).json().payload;
    expect((await run()).engine).toBe('agents');
    expect((await run()).engine).toBe('agents');
    expect(await run()).toMatchObject({ engine: 'template', answer: TEMPLATE, agent: { outcome: 'budget_exhausted', model_calls: 0 } });
    expect(requests).toHaveLength(2);
  });

  it('resets the daily budget at midnight Pacific time', async () => {
    const { requests, fetchImpl } = service(agentReply(TEMPLATE));
    let now = new Date('2026-10-21T06:59:00Z'); // 23:59 in Los Angeles
    const app = buildApp(catalog, undefined, { agentsUrl: AGENTS_URL, fetchImpl, dailyModelCalls: 4, now: () => now });
    const run = async () => (await app.inject({ method: 'POST', url: '/api/ask', payload: PLAYER })).json().payload;
    await run();
    expect((await run()).agent.outcome).toBe('budget_exhausted');
    now = new Date('2026-10-21T07:01:00Z');
    expect((await run()).agent.outcome).toBe('ok');
    expect(requests).toHaveLength(2);
  });

  it('keeps the template answer while the concurrency limit is full', async () => {
    let release = () => {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const request = JSON.parse(init.body as string) as AgentRequest;
      await new Promise<void>((resolve) => { release = resolve; });
      return agentReply(TEMPLATE)(request);
    }) as unknown as typeof fetch;
    const app = buildApp(catalog, undefined, { agentsUrl: AGENTS_URL, fetchImpl, concurrentRuns: 1 });
    const first = app.inject({ method: 'POST', url: '/api/ask', payload: PLAYER });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = (await app.inject({ method: 'POST', url: '/api/ask', payload: PLAYER })).json().payload;
    expect(second).toMatchObject({ engine: 'template', agent: { outcome: 'budget_exhausted' } });
    release();
    expect((await first).json().payload.agent.outcome).toBe('ok');
  });

  it('never calls the service when AGENTS_URL is not configured', async () => {
    const { requests, fetchImpl } = service(agentReply('Unused.'));
    const payload = await askWith({ fetchImpl }, { question: 'What is the score?', at_ms: 30 * MIN });
    expect(payload).toMatchObject({ answered: true, engine: 'template', agent: null });
    expect(requests).toHaveLength(0);
  });
});
