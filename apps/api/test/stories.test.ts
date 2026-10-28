import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp, type AgentOptions } from '../src/app.js';
import type { AgentRequest } from '../src/agentClient.js';
import { loadCatalog } from '../src/catalog.js';

const catalog = loadCatalog(fileURLToPath(new URL('../../../data/catalog', import.meta.url)));
const AGENTS_URL = 'http://agents.test';

async function setup(agents: AgentOptions = {}) {
  const app = buildApp(catalog, undefined, agents);
  const events = (await app.inject({ url: "/api/match/demo/events?at_ms=5400000" })).json().payload.events as Array<{ id: string; type: string; player: string; at_ms: number }>;
  const goal = events.find((e) => e.type === 'goal' && e.player === 'p-go')!;
  const story = async (id: string, atMs = 54 * 60_000) => app.inject({ method: 'POST', url: `/api/studio/stories/${id}`, payload: { at_ms: atMs } });
  const check = async (id: string, text: string) => (await app.inject({ method: 'POST', url: `/api/studio/stories/${id}/check`, payload: { text } })).json().payload;
  const approve = async (id: string, body: Record<string, unknown>) => app.inject({ method: 'POST', url: `/api/studio/stories/${id}/approve`, payload: body });
  const air = async (id: string, body: Record<string, unknown>) => app.inject({ method: 'POST', url: `/api/studio/stories/${id}/air`, payload: body });
  const recovery = async (id: string, atMs: number) => app.inject({ method: 'POST', url: `/api/studio/stories/${id}/recovery`, payload: { at_ms: atMs } });
  const onAirAt = async (atMs: number) => (await app.inject({ url: `/api/match/demo/events?at_ms=${atMs}` })).json().payload.on_air;
  return { events, goal, story, check, approve, air, recovery, onAirAt };
}

// shortcut: checks only the keywords docs/schemas/overlay.schema.json uses; use a full validator if the schema grows.
const schema = JSON.parse(readFileSync(fileURLToPath(new URL('../../../docs/schemas/overlay.schema.json', import.meta.url)), 'utf8'));
function schemaProblems(card: Record<string, unknown>): string[] {
  const props = schema.properties as Record<string, { const?: unknown; type?: string; enum?: unknown[]; minimum?: number; maxLength?: number; items?: { type: string } }>;
  const problems = (schema.required as string[]).filter((k) => !(k in card)).map((k) => `missing ${k}`);
  for (const [key, value] of Object.entries(card)) {
    const rule = props[key];
    if (!rule) { problems.push(`extra ${key}`); continue; }
    const kind = rule.type === 'integer' ? Number.isInteger(value) : rule.type === 'array' ? Array.isArray(value) && value.every((v) => typeof v === rule.items!.type) : rule.type ? typeof value === rule.type : true;
    if (!kind || ('const' in rule && value !== rule.const) || (rule.enum && !rule.enum.includes(value))
      || (rule.minimum !== undefined && (value as number) < rule.minimum) || (rule.maxLength !== undefined && (value as string).length > rule.maxLength)) problems.push(`bad ${key}`);
  }
  return problems;
}

function service(reply: (request: AgentRequest) => Record<string, unknown>) {
  const requests: AgentRequest[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const request = JSON.parse(init.body as string) as AgentRequest;
    requests.push(request);
    return new Response(JSON.stringify({ request_id: request.request_id, engine: 'agents', outcome: 'ok', model_calls: 2, steps: [], ...reply(request) }), { headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { requests, fetchImpl };
}

describe('Studio moment stories', () => {
  it('writes template copy for a goal from the event and the season record, without the agents', async () => {
    const { goal, story } = await setup();
    const payload = (await story(goal.id)).json().payload;
    expect(payload).toMatchObject({ type: 'goal', minute: 12, short: 'GOAL 12′ · Youngho Go (VR)', engine: 'template', agent: null });
    expect(payload.long).toBe('Youngho Go scored for Vellmouth Rovers in the 12th minute, set up by Callum Hale. It is goal number 1 for Youngho Go in this match (synthetic match). Before today, Youngho Go had 5 league goals in 6 games this season (seeded world pack).');
  });

  it('refuses events that are not goals or substitutions, and unknown ids', async () => {
    const { events, story } = await setup();
    expect((await story(events.find((e) => e.type === 'kickoff')!.id)).statusCode).toBe(404);
    expect((await story('nope')).statusCode).toBe(404);
  });

  it('asks the agents once per moment with the critic and the event as evidence, then reuses the story', async () => {
    const LONG = 'Youngho Go scored for Vellmouth Rovers in the 12th minute. Fans call Youngho Go "The Lighthouse".';
    const { requests, fetchImpl } = service(() => ({ answer: LONG }));
    const { goal, story } = await setup({ agentsUrl: AGENTS_URL, fetchImpl });
    const first = (await story(goal.id)).json().payload;
    await story(goal.id);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ grounding: 'evidence', critic: true, max_model_calls: 4 });
    expect(requests[0].evidence[0].ref).toBe(`event:${goal.id}`);
    expect(requests[0].evidence.map((e) => e.ref)).not.toContain('stats:p-go');
    expect(first).toMatchObject({ long: LONG, engine: 'agents', short: 'GOAL 12′ · Youngho Go (VR)' });
  });

  it('retries a moment whose run ended for a passing reason', async () => {
    const { requests, fetchImpl } = service(() => ({ answer: 'Unused.', engine: 'template', outcome: 'provider_error', model_calls: 1 }));
    const { goal, story } = await setup({ agentsUrl: AGENTS_URL, fetchImpl });
    expect((await story(goal.id)).json().payload).toMatchObject({ engine: 'template', agent: { outcome: 'provider_error' } });
    await story(goal.id);
    expect(requests).toHaveLength(2);
  });

  it('sends two scripted wrong-figure drafts for the recovery demonstration and returns the real review steps', async () => {
    const steps = [{ agent: 'reviewer', action: 'review', detail: 'Failed the number and name check: the number 14 is not in the evidence.', ok: false }];
    const { requests, fetchImpl } = service(() => ({ answer: 'template', engine: 'template', outcome: 'rejected', model_calls: 0, steps }));
    const app = buildApp(catalog, undefined, { agentsUrl: AGENTS_URL, fetchImpl, dailyModelCalls: 1 });
    const { goal } = await setup();
    const res = await app.inject({ method: 'POST', url: `/api/studio/stories/${goal.id}/recovery`, payload: { at_ms: goal.at_ms } });
    expect(requests[0].scripted_drafts).toEqual([
      'Youngho Go scored for Vellmouth Rovers in the 14th minute, set up by Callum Hale.',
      'Youngho Go scored for Vellmouth Rovers in the 16th minute, set up by Callum Hale.'
    ]);
    // A daily budget of 1 would refuse a real run (it reserves 4): the demonstration does not use the budget.
    expect(res.json().payload).toMatchObject({ id: goal.id, agent: { outcome: 'rejected', model_calls: 0, steps } });
  });

  it('reports the recovery demonstration as unavailable without the agent service', async () => {
    const { goal } = await setup();
    const app = buildApp(catalog);
    expect((await app.inject({ method: 'POST', url: `/api/studio/stories/${goal.id}/recovery`, payload: { at_ms: goal.at_ms } })).statusCode).toBe(503);
  });

  it('checks an edited story against the moment evidence before approval', async () => {
    const { goal, check } = await setup();
    expect(await check(goal.id, 'Youngho Go scored in the 12th minute, set up by Callum Hale.')).toEqual({ ok: true, problem: null });
    expect(await check(goal.id, 'Youngho Go scored his 9th goal of the season.')).toMatchObject({ ok: false, problem: 'the figure 9 is not in the evidence' });
    expect(await check(goal.id, 'Youngho Go scored after a pass from Arlo Penn.')).toMatchObject({ ok: false, problem: 'the name "Arlo" is not in the evidence' });
    expect(await check(goal.id, '   ')).toMatchObject({ ok: false });
  });

  it('requires an API check and approval for the exact copy before taking it to air', async () => {
    const { goal, check, approve, air } = await setup();
    const body = { text: 'Youngho Go scored in the 12th minute, set up by Callum Hale.', version: 2, engine: 'agents', at_ms: goal.at_ms };
    const earlyAir = await air(goal.id, body);
    expect(earlyAir.statusCode).toBe(409);
    expect(earlyAir.json().error.code).toBe('approval_required');
    const uncheckedApproval = await approve(goal.id, body);
    expect(uncheckedApproval.statusCode).toBe(409);
    expect(uncheckedApproval.json().error.code).toBe('check_required');
    expect(await check(goal.id, body.text)).toEqual({ ok: true, problem: null });
    expect((await approve(goal.id, body)).json().payload).toMatchObject({ approved: true, version: 2 });
    const res = await air(goal.id, body);
    const card = res.json().payload;
    expect(res.statusCode).toBe(200);
    expect(schemaProblems(card)).toEqual([]);
    expect(card).toMatchObject({ card_id: goal.id, version: 2, short: 'GOAL 12′ · Youngho Go (VR)', engine: 'agents', synthetic: true });
    expect(card.evidence[0]).toBe(`event:${goal.id}`);
  });

  it('never airs an edit with a figure or name outside the evidence, whatever the Studio sent', async () => {
    const { goal, air, onAirAt } = await setup();
    const res = await air(goal.id, { text: 'Youngho Go scored his 9th goal of the season.', version: 1, engine: 'template', at_ms: goal.at_ms });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('unsupported_claim');
    expect((await air(goal.id, { text: 'Fine copy.', version: 0, engine: 'template', at_ms: goal.at_ms })).statusCode).toBe(400);
    expect(await onAirAt(goal.at_ms)).toBeNull();
  });

  it('shows an aired story to fans from its moment for ten match minutes, never before', async () => {
    const { goal, check, approve, air, onAirAt } = await setup();
    const body = { text: 'Youngho Go scored in the 12th minute.', version: 1, engine: 'template', at_ms: goal.at_ms };
    await check(goal.id, body.text);
    await approve(goal.id, body);
    await air(goal.id, body);
    expect(await onAirAt(goal.at_ms - 1)).toBeNull();
    expect((await onAirAt(goal.at_ms)).card_id).toBe(goal.id);
    expect((await onAirAt(goal.at_ms + 10 * 60_000))).toBeNull();
  });

  it('pulls an aired goal story from on_air when the goal is retracted at 55:00', async () => {
    const { events, story, check, approve, air, recovery, onAirAt } = await setup();
    const disallowed = events.find((e) => e.type === 'goal' && e.at_ms === 52 * 60_000)!;
    expect((await story(disallowed.id, 55 * 60_000)).json().error.code).toBe('moment_retracted');
    expect((await recovery(disallowed.id, 55 * 60_000)).json().error.code).toBe('moment_retracted');
    const body = { text: 'Jude Marlow scored in the 52nd minute.', version: 1, engine: 'template', at_ms: 54 * 60_000 };
    await check(disallowed.id, body.text);
    expect((await approve(disallowed.id, body)).statusCode).toBe(200);
    expect((await air(disallowed.id, body)).statusCode).toBe(200);
    expect((await onAirAt(54 * 60_000)).card_id).toBe(disallowed.id);
    expect(await onAirAt(55 * 60_000)).toBeNull();
    expect((await approve(disallowed.id, { ...body, at_ms: 55 * 60_000 })).json().error.code).toBe('moment_retracted');
    expect((await air(disallowed.id, { ...body, at_ms: 55 * 60_000 })).json().error.code).toBe('moment_retracted');
  });

  it('does not allow approval before the event reaches the replay clock', async () => {
    const { goal, story, check, approve } = await setup();
    const body = { text: 'Youngho Go scored in the 12th minute.', version: 1, engine: 'template', at_ms: 0 };
    expect((await story(goal.id, 0)).json().error.code).toBe('moment_not_reached');
    await check(goal.id, body.text);
    const res = await approve(goal.id, body);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('moment_not_reached');
  });

  it('supports detailed build-up copy and Korean localization for Studio stories', async () => {
    const app = buildApp(catalog);
    const { goal } = await setup();
    const detailed = (await app.inject({ method: 'POST', url: `/api/studio/stories/${goal.id}`, payload: { depth: 'detailed', at_ms: goal.at_ms } })).json().payload;
    expect(detailed.long).toContain('Build-up: 3 passes advancing 65 m');
    const ko = (await app.inject({ method: 'POST', url: `/api/studio/stories/${goal.id}`, payload: { lang: 'ko', depth: 'detailed', at_ms: goal.at_ms } })).json().payload;
    expect(ko.short).toContain('골 12′');
    expect(ko.long).toContain('65m 전진');
  });
});
