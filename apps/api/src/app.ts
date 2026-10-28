import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyServerOptions } from 'fastify';
import type { Catalog, Player } from './catalog.js';
import { comparison, leaders, stories, streaks } from './insights.js';
import { MATCH_MS, generateScenario, snapshotAt } from './scenario.js';
import { answer, type AskSubject } from './ask.js';
import { agentRequest, askAgents, createAgentLimiter, gateAgentResult, unsupportedClaim, type AgentLimits } from './agentClient.js';
import { createRetriever, passages as worldPassages } from './retrieval.js';
import { STORY_TYPES, buildRecap, momentTemplate, wrongDrafts, type Depth, type Lang } from './stories.js';

const FORMATION: Record<Player['pos'], number> = { GK: 1, DF: 4, MF: 3, FW: 3 };
const ROLE_ORDER: Player['role'][] = ['starter', 'rotation', 'squad', 'youth'];
const BENCH_SIZE = 9;
const SCENARIO_SEED = 42;
const QUESTION_MAX = 300;
const STORY_MAX = 1000;
const STORY_REQUEST = 'Write broadcast copy for this match moment for the on-air producer: two short sentences, first what happened, then one background fact about the player from the evidence.';
const RETRY_OUTCOMES = new Set(['budget_exhausted', 'provider_error', 'timeout']);
// How long an aired lower-third stays on the fans' screen, in match time after its moment.
const ON_AIR_MS = 10 * 60_000;

function searchQuestion(question: string, lang: 'en' | 'ko'): string {
  if (lang !== 'ko') return question;
  const terms: string[] = [];
  const cues: Array<[RegExp, string]> = [
    [/응원가|응원\s*문화|노래|가사|팬\s*문화/u, 'chant supporters song culture tradition'],
    [/역사|연혁|창단|설립/u, 'history founded origin club'],
    [/경기장|구장|홈구장|수용\s*인원/u, 'ground stadium capacity venue'],
    [/선수\s*경력|여정|이적|임대|이전\s*소속/u, 'career loan joined transfer'],
    [/국적|출신|대표팀|국대/u, 'nationality country international team caps'],
    [/발음|읽는\s*법|어떻게\s*읽/u, 'pronunciation say native name'],
    [/나이|몇\s*살|출생/u, 'age born'],
    [/우승|트로피|컵/u, 'champions cup winners trophy'],
    [/팬\s*언어|무슨\s*뜻|뜻|별명/u, 'fan language means nickname meaning']
  ];
  for (const [pattern, expansion] of cues) if (pattern.test(question)) terms.push(expansion);
  return [question, ...terms].join(' ');
}

// An aired story, shaped by docs/schemas/overlay.schema.json.
export interface Overlay { schema_version: '1'; card_id: string; version: number; short: string; long: string; evidence: string[]; valid_from_ms: number; engine: 'template' | 'agents'; synthetic: true }
// Crests are generated WebP images or the older authored SVGs; the content type follows the extension.
const MEDIA: Record<string, RegExp> = { people: /^[a-z0-9-]+\.webp$/, crests: /^[a-z0-9-]+\.(webp|svg)$/ };

// Every response uses the envelope from the plan's shared contract decisions.
function send(reply: FastifyReply, catalog: Catalog, payload: unknown, status = 200, error: { code: string; message: string } | null = null) {
  return reply.status(status).send({ schema_version: '1', data_version: catalog.league.meta.data_date, payload, error });
}

const notFound = (reply: FastifyReply, catalog: Catalog, what: string) =>
  send(reply, catalog, null, 404, { code: 'not_found', message: `Unknown ${what}.` });

// Line-up tokens carry only figures from the records: age and this season's league line.
function briefer(catalog: Catalog) {
  return (p: Player) => {
    const current = (catalog.statistics.summaries.players[p.id]?.current_season ?? null) as { appearances: number; goals: number; shots: number; fouls: number } | null;
    const age = p.age as { years: number; approximate: boolean };
    return {
      id: p.id, name: p.name, native_name: (p.native_name as string | undefined) ?? null, number: p.number, pos: p.pos, nationality: p.nationality, pronunciation: (p.pronunciation as string | undefined) ?? null,
      captain: p.captain_since !== undefined && !p.vice_captain_since, age: age.years, season_goals: current?.goals ?? 0, season_apps: current?.appearances ?? 0,
      season_shots: current?.shots ?? 0, season_fouls: current?.fouls ?? 0, height_cm: p.height_cm as number, value_eur_m: p.market_value_eur_m as number
    };
  };
}

// shortcut: line-ups follow a fixed 4-3-3 from authored roles and double as the scenario's team sheet; replace when tactics vary.
export function lineup<T>(players: Player[], brief: (p: Player) => T) {
  const ranked = [...players].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const starters = (Object.keys(FORMATION) as Player['pos'][]).flatMap((pos) => ranked.filter((p) => p.pos === pos).slice(0, FORMATION[pos]));
  const bench = ranked.filter((p) => !starters.includes(p)).slice(0, BENCH_SIZE);
  return { formation: '4-3-3', starters: starters.map(brief), bench: bench.map(brief) };
}

function clubCard(catalog: Catalog, id: string) {
  const club = catalog.league.clubs.find((c) => c.id === id);
  if (!club) return null;
  const season = catalog.league.seasons.at(-1)!;
  const row = season.table.find((r) => r.club === id) ?? null;
  return { ...club, standing: row };
}

export interface AgentOptions extends AgentLimits { agentsUrl?: string; fetchImpl?: typeof fetch }

// webDir: the built dashboard, served next to the API in one container. requestsPerMinute: per-client limit on POST
// requests (off when unset). trustProxy: proxy hops in front of the app, so the client address comes from X-Forwarded-For.
export interface WebOptions { webDir?: string; requestsPerMinute?: number; trustProxy?: number }

const WEB_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json'
};
const WINDOW_MS = 60_000;

// shortcut: a fixed one-minute window per client address, kept in this process; enough for one API replica.
function rateLimiter(perMinute: number, now = () => Date.now()) {
  const hits = new Map<string, { start: number; count: number }>();
  return (client: string) => {
    const t = now();
    if (hits.size > 10_000) for (const [key, hit] of hits) if (t - hit.start >= WINDOW_MS) hits.delete(key);
    const hit = hits.get(client);
    if (!hit || t - hit.start >= WINDOW_MS) {
      hits.set(client, { start: t, count: 1 });
      return true;
    }
    hit.count += 1;
    return hit.count <= perMinute;
  };
}

export function buildApp(catalog: Catalog, mediaDir?: string, agents: AgentOptions = {}, web: WebOptions = {}): FastifyInstance {
  const hops = web.trustProxy ?? 0;
  // Trust only the nearest proxy hops (the ingress), so a client cannot pick its own address with X-Forwarded-For.
  const options: FastifyServerOptions = { trustProxy: hops > 0 ? (_address: string, hop: number) => hop < hops : false };
  const app = Fastify(options);
  if (web.requestsPerMinute) {
    const allow = rateLimiter(web.requestsPerMinute);
    app.addHook('onRequest', async (req, reply) => {
      if (req.method === 'POST' && !allow(req.ip)) {
        return send(reply.header('retry-after', String(WINDOW_MS / 1000)), catalog, null, 429, { code: 'rate_limited', message: 'Too many requests. Try again in a minute.' });
      }
    });
  }
  const brief = briefer(catalog);
  const limited = createAgentLimiter(agents);
  const retriever = createRetriever(catalog);
  const passageByRef = new Map(worldPassages(catalog).map((p) => [p.ref, p]));
  const playersOf = (club: string) => catalog.people.players.filter((p) => p.club === club);

  const { demo_fixture: demo } = catalog.league.league;
  const sheet = (club: string) => { const l = lineup(playersOf(club), (p) => p); return { club, starters: l.starters.map((p) => p.id), bench: l.bench.map((p) => p.id) }; };
  const events = generateScenario(SCENARIO_SEED, [sheet(demo.home), sheet(demo.away)]);

  // shortcut: aired stories live in this process and are shared by every viewer; one API replica, reset on restart.
  const aired = new Map<string, Overlay>();
  // Demo workflow state is process-local; identity and durable storage are intentionally out of scope.
  const checkedCopies = new Map<string, string>();
  const approvals = new Map<string, { text: string; version: number; engine: 'template' | 'agents' }>();

  app.get('/api/health', (_req, reply) => send(reply, catalog, { status: 'ok' }));

  // The replay clock asks for the match as it stood at at_ms; later events never leave the server.
  app.get<{ Querystring: { at_ms?: string; lang?: string } }>('/api/match/demo/events', (req, reply) => {
    const raw = req.query.at_ms ?? '0';
    const atMs = /^\d{1,7}$/.test(raw) ? Number(raw) : NaN;
    if (!(atMs <= MATCH_MS)) return send(reply, catalog, null, 400, { code: 'bad_request', message: `at_ms must be a whole number from 0 to ${MATCH_MS}.` });
    const lang: Lang = req.query.lang === 'ko' ? 'ko' : 'en';
    const snap = snapshotAt(events, atMs, [demo.home, demo.away]);
    // The latest aired story whose moment the clock has reached and has not been retracted, for a few match minutes.
    const live = [...aired.values()].filter((o) => {
      const ev = events.find((e) => e.id === o.card_id);
      const isRetracted = ev?.retracted_at_ms !== undefined && atMs >= ev.retracted_at_ms;
      return !isRetracted && o.valid_from_ms <= atMs && atMs < o.valid_from_ms + ON_AIR_MS;
    });
    const onAir = live.sort((a, b) => b.valid_from_ms - a.valid_from_ms)[0] ?? null;
    const recap = buildRecap(catalog, snap, [demo.home, demo.away], lang);
    return send(reply, catalog, { ...snap, duration_ms: MATCH_MS, seed: SCENARIO_SEED, synthetic: true, on_air: onAir, recap });
  });

  app.get<{ Querystring: { lang?: string } }>('/api/match/demo', (req, reply) => {
    const { demo_fixture: fixture, current_season: season } = catalog.league.league;
    const lang: Lang = req.query.lang === 'ko' ? 'ko' : 'en';
    return send(reply, catalog, {
      season, matchday: fixture.matchday, kickoff: fixture.kickoff, synthetic: true,
      home: { ...clubCard(catalog, fixture.home), lineup: lineup(playersOf(fixture.home), brief) },
      away: { ...clubCard(catalog, fixture.away), lineup: lineup(playersOf(fixture.away), brief) },
      head_to_head: catalog.statistics.summaries.head_to_head,
      insights: Object.fromEntries([fixture.home, fixture.away].map((club) => [club, {
        comparison: comparison(catalog, club, playersOf(club)),
        streaks: streaks(catalog, club, lang),
        stories: stories(catalog, club, playersOf(club), lang)
      }])),
      leaders: leaders(catalog, [...playersOf(fixture.home), ...playersOf(fixture.away)], brief)
    });
  });

  // Ask (D17): a template answer costs no model call and is returned as is to fans. A question the templates cannot answer
  // goes to the agents with world-pack passages from the keyword index. The Studio also has template answers reworded,
  // with the model critic. Every agent answer passes gateAgentResult; the template answer is the fallback.
  app.post<{ Body: { question?: unknown; at_ms?: unknown; subject?: { kind?: unknown; id?: unknown } | null; studio?: unknown; lang?: unknown } }>('/api/ask', async (req, reply) => {
    const { question, at_ms: atMs = 0, subject = null, studio = false, lang: rawLang = 'en' } = req.body ?? {};
    const bad = (message: string) => send(reply, catalog, null, 400, { code: 'bad_request', message });
    if (typeof question !== 'string' || !question.trim() || question.length > QUESTION_MAX) return bad(`question must be 1 to ${QUESTION_MAX} characters.`);
    if (!Number.isInteger(atMs) || (atMs as number) < 0 || (atMs as number) > MATCH_MS) return bad(`at_ms must be a whole number from 0 to ${MATCH_MS}.`);
    if (rawLang !== 'en' && rawLang !== 'ko') return bad('lang must be en or ko.');
    const lang = rawLang;
    const known = subject === null
      || (subject.kind === 'player' && catalog.people.players.some((p) => p.id === subject.id))
      || (subject.kind === 'club' && catalog.league.clubs.some((c) => c.id === subject.id));
    if (!known) return bad('subject must be a known player or club.');
    const text = question.trim();
    const template = answer(catalog, events, [demo.home, demo.away], text, atMs as number, subject as AskSubject | null, lang);
    const isStudio = studio === true;
    const { agentsUrl } = agents;
    if (!agentsUrl || (template.answered && !isStudio)) return send(reply, catalog, gateAgentResult(template, null));
    // A panel question is about its subject, so the subject's name joins the search terms.
    const subjectName = subject && (catalog.people.players.find((p) => p.id === subject.id) ?? catalog.league.clubs.find((c) => c.id === subject.id))?.name;
    const query = subjectName ? `${subjectName} ${text}` : text;
    const passages = template.answered ? undefined : retriever.search(searchQuestion(query, lang));
    if (passages?.length === 0) return send(reply, catalog, gateAgentResult(template, null));
    const payload = agentRequest(text, template, { critic: isStudio, passages, answerLanguage: lang });
    const agent = await limited(payload, () => askAgents(agentsUrl, payload, agents.fetchImpl));
    return send(reply, catalog, gateAgentResult(template, agent, payload));
  });

  // Studio moment stories: the agents write broadcast copy for a goal or substitution from the event and world-pack
  // passages, with the critic; the template copy is the fallback. One run per moment, kept for the life of the process,
  // except runs that ended for a passing reason (budget, model error, time), which the next request retries.
  const momentOf = (id: string, opts?: { lang?: Lang; depth?: Depth }) => {
    const event = events.find((e) => e.id === id && STORY_TYPES.has(e.type));
    return event && momentTemplate(catalog, events, event, passageByRef, opts);
  };
  const drafts = new Map<string, Promise<unknown>>();
  app.post<{ Params: { id: string }; Body: { lang?: unknown; depth?: unknown; at_ms?: unknown } }>('/api/studio/stories/:id', async (req, reply) => {
    const candidate = momentOf(req.params.id);
    if (!candidate) return notFound(reply, catalog, 'moment');
    const atMs = req.body?.at_ms;
    const event = events.find((e) => e.id === candidate.id)!;
    if (!Number.isInteger(atMs) || (atMs as number) < 0 || (atMs as number) > MATCH_MS) {
      return send(reply, catalog, null, 400, { code: 'bad_request', message: `at_ms must be a whole number from 0 to ${MATCH_MS}.` });
    }
    if ((atMs as number) < event.at_ms) return send(reply, catalog, null, 409, { code: 'moment_not_reached', message: 'This match moment has not happened yet.' });
    if (event.retracted_at_ms !== undefined && (atMs as number) >= event.retracted_at_ms) {
      return send(reply, catalog, null, 409, { code: 'moment_retracted', message: 'This moment was retracted and cannot be drafted.' });
    }
    const lang: Lang = req.body?.lang === 'ko' ? 'ko' : 'en';
    const depth: Depth = req.body?.depth === 'detailed' ? 'detailed' : 'short';
    const moment = momentOf(req.params.id, { lang, depth });
    if (!moment) return notFound(reply, catalog, 'moment');
    const key = `${moment.id}:${lang}:${depth}`;
    if (!drafts.has(key)) {
      const draft = (async () => {
        const template = { answer: moment.long, answered: true, subject: null, sources: moment.evidence.map(({ ref, label }) => ({ ref, label })), engine: 'template' as const };
        const { agentsUrl } = agents;
        if (!agentsUrl || lang !== 'en') return gateAgentResult(template, null);
        const payload = agentRequest(STORY_REQUEST, template, { critic: true, passages: moment.evidence });
        return gateAgentResult(template, await limited(payload, () => askAgents(agentsUrl, payload, agents.fetchImpl)), payload);
      })();
      drafts.set(key, draft);
      draft.then((result) => { if (RETRY_OUTCOMES.has((result as { agent: { outcome: string } | null }).agent?.outcome ?? '')) drafts.delete(key); });
    }
    const { answer: long, engine, sources, agent } = (await drafts.get(key)) as ReturnType<typeof gateAgentResult>;
    return send(reply, catalog, { id: moment.id, minute: moment.minute, type: moment.type, short: moment.short, long, template_long: moment.long, ...(moment.buildup ? { buildup: moment.buildup } : {}), engine, sources, agent });
  });

  // Recovery demonstration for the Studio and the demo video: the agent service runs its real review on two scripted
  // drafts with a wrong figure, so the steps show the catch, the one rewrite, and the template fallback. No model call,
  // so the model-call limiter is not involved.
  app.post<{ Params: { id: string }; Body: { at_ms?: unknown } }>('/api/studio/stories/:id/recovery', async (req, reply) => {
    const moment = momentOf(req.params.id);
    if (!moment) return notFound(reply, catalog, 'moment');
    const atMs = req.body?.at_ms;
    const event = events.find((e) => e.id === moment.id)!;
    if (!Number.isInteger(atMs) || (atMs as number) < 0 || (atMs as number) > MATCH_MS) {
      return send(reply, catalog, null, 400, { code: 'bad_request', message: `at_ms must be a whole number from 0 to ${MATCH_MS}.` });
    }
    if ((atMs as number) < event.at_ms) return send(reply, catalog, null, 409, { code: 'moment_not_reached', message: 'This match moment has not happened yet.' });
    if (event.retracted_at_ms !== undefined && (atMs as number) >= event.retracted_at_ms) {
      return send(reply, catalog, null, 409, { code: 'moment_retracted', message: 'This moment was retracted and cannot be reviewed.' });
    }
    const { agentsUrl } = agents;
    if (!agentsUrl) return send(reply, catalog, null, 503, { code: 'agents_unavailable', message: 'The agent service is not configured.' });
    const template = { answer: moment.long, answered: true, subject: null, sources: [], engine: 'template' as const };
    const payload = { ...agentRequest(STORY_REQUEST, template, { critic: true, passages: moment.evidence }), scripted_drafts: wrongDrafts(moment.long) };
    const result = gateAgentResult(template, await askAgents(agentsUrl, payload, agents.fetchImpl), payload);
    if (!result.agent) return send(reply, catalog, null, 502, { code: 'agents_unavailable', message: 'The agent service did not answer.' });
    return send(reply, catalog, { id: moment.id, drafts: payload.scripted_drafts, agent: result.agent });
  });

  // An edited story is checked like an agent answer before the Studio may approve it.
  app.post<{ Params: { id: string }; Body: { text?: unknown } }>('/api/studio/stories/:id/check', (req, reply) => {
    const moment = momentOf(req.params.id);
    if (!moment) return notFound(reply, catalog, 'moment');
    const { text } = req.body ?? {};
    if (typeof text !== 'string' || text.length > STORY_MAX) return send(reply, catalog, null, 400, { code: 'bad_request', message: `text must be a string of at most ${STORY_MAX} characters.` });
    const problem = unsupportedClaim(text, moment.evidence.map((e) => e.text).join('\n'));
    checkedCopies.delete(moment.id);
    if (problem === null) checkedCopies.set(moment.id, text);
    return send(reply, catalog, { ok: problem === null, problem });
  });

  // Approval is tied to the exact copy and version that passed the API check; no login or durable storage is used in this demo.
  app.post<{ Params: { id: string }; Body: { text?: unknown; version?: unknown; engine?: unknown; at_ms?: unknown } }>('/api/studio/stories/:id/approve', (req, reply) => {
    const moment = momentOf(req.params.id);
    if (!moment) return notFound(reply, catalog, 'moment');
    const { text, version, engine, at_ms: atMs } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim() || text.length > STORY_MAX || !Number.isInteger(version) || (version as number) < 1
      || (engine !== 'template' && engine !== 'agents') || !Number.isInteger(atMs) || (atMs as number) < 0 || (atMs as number) > MATCH_MS) {
      return send(reply, catalog, null, 400, { code: 'bad_request', message: `text must be 1 to ${STORY_MAX} characters, version a whole number from 1, engine template or agents, and at_ms a whole number from 0 to ${MATCH_MS}.` });
    }
    const event = events.find((e) => e.id === moment.id)!;
    if ((atMs as number) < event.at_ms) return send(reply, catalog, null, 409, { code: 'moment_not_reached', message: 'This match moment has not happened yet.' });
    if (event.retracted_at_ms !== undefined && (atMs as number) >= event.retracted_at_ms) {
      return send(reply, catalog, null, 409, { code: 'moment_retracted', message: 'This moment was retracted and cannot be approved.' });
    }
    const problem = unsupportedClaim(text, moment.evidence.map((e) => e.text).join('\n'));
    if (problem) return send(reply, catalog, null, 422, { code: 'unsupported_claim', message: `Not approved: ${problem}.` });
    if (checkedCopies.get(moment.id) !== text) return send(reply, catalog, null, 409, { code: 'check_required', message: 'Check this exact copy before approving it.' });
    const approval: { text: string; version: number; engine: 'template' | 'agents' } = { text, version: version as number, engine: engine as 'template' | 'agents' };
    approvals.set(moment.id, approval);
    return send(reply, catalog, { approved: true, version: approval.version });
  });

  // Taking a story to air rechecks evidence, replay state, and the exact server-held approval.
  app.post<{ Params: { id: string }; Body: { text?: unknown; version?: unknown; engine?: unknown; at_ms?: unknown } }>('/api/studio/stories/:id/air', (req, reply) => {
    const moment = momentOf(req.params.id);
    if (!moment) return notFound(reply, catalog, 'moment');
    const { text, version, engine, at_ms: atMs } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim() || text.length > STORY_MAX || !Number.isInteger(version) || (version as number) < 1
      || (engine !== 'template' && engine !== 'agents') || !Number.isInteger(atMs) || (atMs as number) < 0 || (atMs as number) > MATCH_MS) {
      return send(reply, catalog, null, 400, { code: 'bad_request', message: `text must be 1 to ${STORY_MAX} characters, version a whole number from 1, engine template or agents, and at_ms a whole number from 0 to ${MATCH_MS}.` });
    }
    const event = events.find((e) => e.id === moment.id)!;
    if ((atMs as number) < event.at_ms) return send(reply, catalog, null, 409, { code: 'moment_not_reached', message: 'This match moment has not happened yet.' });
    if (event.retracted_at_ms !== undefined && (atMs as number) >= event.retracted_at_ms) {
      return send(reply, catalog, null, 409, { code: 'moment_retracted', message: 'This moment was retracted and cannot be taken to air.' });
    }
    const problem = unsupportedClaim(text, moment.evidence.map((e) => e.text).join('\n'));
    if (problem) return send(reply, catalog, null, 422, { code: 'unsupported_claim', message: `Not taken to air: ${problem}.` });
    const approval = approvals.get(moment.id);
    if (!approval) return send(reply, catalog, null, 409, { code: 'approval_required', message: 'Approve this story before taking it to air.' });
    if (approval.text !== text || approval.version !== version || approval.engine !== engine) {
      return send(reply, catalog, null, 409, { code: 'approval_mismatch', message: 'The copy, version, or engine differs from the approved story.' });
    }
    const overlay: Overlay = {
      schema_version: '1', card_id: moment.id, version: version as number, short: moment.short, long: text.trim(),
      evidence: moment.evidence.map((e) => e.ref), valid_from_ms: event.at_ms, engine, synthetic: true
    };
    aired.set(moment.id, overlay);
    return send(reply, catalog, overlay);
  });

  app.get('/api/league/table', (_req, reply) => {
    const season = catalog.league.seasons.at(-1)!;
    const clubs = new Map(catalog.league.clubs.map((c) => [c.id, c]));
    // League basics and the glossary for new fans (Discover); all from the authored world pack.
    const l = catalog.league.league;
    return send(reply, catalog, {
      basics: { name: l.name, founded: l.founded, clubs: l.clubs_per_season, matchdays: l.matchdays, points: l.points, relegated: l.relegated_per_season, second_tier: l.second_tier },
      glossary: catalog.content.league_glossary, data_date: catalog.league.meta.data_date,
      season: season.season, matchdays_played: season.matchdays_played,
      rows: season.table.map((r) => ({ ...r, name: clubs.get(r.club)?.name, short: clubs.get(r.club)?.short, colors: clubs.get(r.club)?.colors }))
    });
  });

  app.get<{ Params: { id: string } }>('/api/clubs/:id', (req, reply) => {
    const card = clubCard(catalog, req.params.id);
    if (!card) return notFound(reply, catalog, 'club');
    const id = req.params.id;
    return send(reply, catalog, {
      ...card,
      content: catalog.content.featured[id] ?? null,
      staff: catalog.people.staff.filter((s) => s.club === id),
      former_managers: catalog.content.former_managers.filter((m) => m.club === id),
      summary: catalog.statistics.summaries.clubs[id] ?? null,
      squad: playersOf(id).map(brief)
    });
  });

  app.get<{ Params: { id: string } }>('/api/players/:id', (req, reply) => {
    const player = catalog.people.players.find((p) => p.id === req.params.id);
    if (!player) return notFound(reply, catalog, 'player');
    const clubName = (id: unknown) => catalog.league.clubs.find((c) => c.id === id)?.name ?? null;
    const loans = (player.loans as Array<{ club: string }> | undefined) ?? [];
    return send(reply, catalog, {
      ...player,
      from_name: clubName(player.from),
      loans: loans.map((l) => ({ ...l, club_name: clubName(l.club) })),
      club: clubCard(catalog, player.club),
      country: catalog.content.countries[player.nationality] ?? null,
      seasons: catalog.statistics.player_seasons.filter((r) => r.player === player.id),
      unavailable: catalog.statistics.unavailable.filter((u) => u.player === player.id),
      summary: catalog.statistics.summaries.players[player.id] ?? null
    });
  });

  // Portraits and crests live in data/catalog/media; only plain "<id>.<ext>" names of a known kind are served, so paths cannot escape the folder.
  app.get<{ Params: { kind: string; file: string } }>('/api/media/:kind/:file', async (req, reply) => {
    const pattern = MEDIA[req.params.kind];
    if (!mediaDir || !pattern || !pattern.test(req.params.file)) return notFound(reply, catalog, 'image');
    try {
      const image = await readFile(join(mediaDir, req.params.kind, req.params.file));
      return reply.type(WEB_TYPES[extname(req.params.file)]).header('cache-control', 'public, max-age=3600').send(image);
    } catch {
      return notFound(reply, catalog, 'image');
    }
  });

  // The dashboard: files under webDir, and index.html for app paths without a file extension.
  if (web.webDir) {
    const root = resolve(web.webDir);
    app.get('/*', async (req, reply) => {
      let path: string;
      try {
        path = decodeURIComponent(req.url.split('?')[0]);
      } catch {
        return notFound(reply, catalog, 'file');
      }
      if (path.startsWith('/api/')) return notFound(reply, catalog, 'route');
      const file = resolve(root, `.${path}`);
      if (!file.startsWith(root + sep) && file !== root) return notFound(reply, catalog, 'file');
      const target = extname(file) ? file : join(root, 'index.html');
      try {
        const body = await readFile(target);
        // Vite fingerprints everything under assets/, so those files never change; the page itself is always revalidated.
        const cache = target.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
        return reply.type(WEB_TYPES[extname(target)] ?? 'application/octet-stream').header('cache-control', cache).send(body);
      } catch {
        return notFound(reply, catalog, 'file');
      }
    });
  }

  return app;
}
