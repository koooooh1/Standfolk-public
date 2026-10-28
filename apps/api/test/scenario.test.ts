import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { loadCatalog } from '../src/catalog.js';
import { MATCH_MS, MINUTE_MS, REFERENCE_RANGES, computeBuildup, generateScenario, snapshotAt, type TeamSheet } from '../src/scenario.js';

const sheets: [TeamSheet, TeamSheet] = [
  { club: 'vr', starters: ['p-strand', 'p-rosk', 'p-wren', 'p-fenner', 'p-barrault', 'p-penn-ade', 'p-hale', 'p-nakase', 'p-marlow', 'p-go', 'p-velde'], bench: ['p-navarre'] },
  { club: 'ka', starters: ['p-lykke', 'p-okoye', 'p-kjeldsen', 'p-stott', 'p-corbet', 'p-varga', 'p-penn-luka', 'p-ansah', 'p-calado', 'p-haldane', 'p-adebanjo'], bench: ['p-lind'] }
];
const events = generateScenario(42, sheets);
const at = (minute: number) => snapshotAt(events, minute * MINUTE_MS, ['vr', 'ka']);

describe('matchday-9 scenario', () => {
  it('reproduces the same events from the same seed', () => {
    expect(JSON.stringify(generateScenario(42, sheets))).toBe(JSON.stringify(events));
    expect(JSON.stringify(generateScenario(7, sheets))).not.toBe(JSON.stringify(events));
  });

  it('keeps events in time order with unique IDs inside the match', () => {
    expect(events.map((e) => e.at_ms)).toEqual([...events.map((e) => e.at_ms)].sort((a, b) => a - b));
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    expect(events.every((e) => e.at_ms >= 0 && e.at_ms <= MATCH_MS)).toBe(true);
  });

  it('follows the authored story: 1-0 at 12, 1-1 at 38, the 58th-minute substitute scores at 66', () => {
    expect(at(11).score).toEqual({ vr: 0, ka: 0 });
    expect(at(12).score).toEqual({ vr: 1, ka: 0 });
    expect(at(38).score).toEqual({ vr: 1, ka: 1 });
    expect(at(66).score).toEqual({ vr: 2, ka: 1 });
    expect(events.find((e) => e.type === 'sub' && e.club === 'vr')).toMatchObject({ minute: 58, player: 'p-navarre', player_off: 'p-velde' });
    expect(events.find((e) => e.type === 'goal' && e.minute === 66)?.player).toBe('p-navarre');
  });

  it('never shows an event from after the clock', () => {
    for (const minute of [0, 12, 45, 67, 90]) expect(at(minute).events.every((e) => e.at_ms <= minute * MINUTE_MS)).toBe(true);
    expect(at(0)).toMatchObject({ phase: 'pre', minute: 0 });
    expect(at(45).phase).toBe('half_time');
    expect(at(90).phase).toBe('full_time');
  });

  it('only uses players who are on the pitch at the time', () => {
    expect(events.filter((e) => e.player === 'p-velde').every((e) => e.at_ms <= 58 * MINUTE_MS)).toBe(true);
    expect(events.filter((e) => e.player === 'p-navarre').every((e) => e.at_ms >= 58 * MINUTE_MS)).toBe(true);
  });

  it('refuses a team sheet without the authored players', () => {
    expect(() => generateScenario(42, [{ ...sheets[0], bench: [] }, sheets[1]])).toThrow(/team sheet/);
  });

  it('retracts the 52nd-minute goal on receipt at 55:00 without leaking the correction earlier', () => {
    expect(at(54).score).toEqual({ vr: 2, ka: 1 });
    expect(at(54).events.find((e) => e.minute === 52)?.retracted).toBe(false);
    expect(at(55).score).toEqual({ vr: 1, ka: 1 });
    expect(at(55).events.find((e) => e.minute === 52)).toMatchObject({ retracted: true, retracted_reason: 'Offside in the build-up' });
  });

  it('computes goal build-up chains and forward pass progress in both directions', () => {
    const chain = computeBuildup([
      { from: 'p-rosk', to: 'p-hale', start_x: 20, end_x: 50 },
      { from: 'p-hale', to: 'p-go', start_x: 50, end_x: 70 },
      { from: 'p-go', to: 'p-go', start_x: 70, end_x: 85 }
    ], 1);
    expect(chain).toEqual({ passes: 3, progress_m: 65, chain: ['p-rosk', 'p-hale', 'p-go'] });
    const reverse = computeBuildup([
      { from: 'p-okoye', to: 'p-varga', start_x: 80, end_x: 50 },
      { from: 'p-varga', to: 'p-calado', start_x: 50, end_x: 25 }
    ], -1);
    expect(reverse).toEqual({ passes: 2, progress_m: 55, chain: ['p-okoye', 'p-varga', 'p-calado'] });
    expect(events.find((e) => e.type === 'goal' && e.minute === 12)?.buildup).toEqual({ passes: 3, progress_m: 65, chain: ['p-rosk', 'p-hale', 'p-go'] });
  });
});

describe('replay API', () => {
  const app = buildApp(loadCatalog(fileURLToPath(new URL('../../../data/catalog', import.meta.url))));
  const get = async (url: string) => { const res = await app.inject({ method: 'GET', url }); return { status: res.statusCode, body: res.json() }; };

  it('returns the match as it stood at the clock, and includes the end-of-match recap only at full-time', async () => {
    const { status, body } = await get(`/api/match/demo/events?at_ms=${40 * MINUTE_MS}`);
    expect(status).toBe(200);
    expect(body.payload).toMatchObject({ minute: 40, phase: 'first_half', score: { vr: 1, ka: 1 }, synthetic: true, duration_ms: MATCH_MS, recap: null });
    expect(body.payload.events.every((e: { at_ms: number }) => e.at_ms <= 40 * MINUTE_MS)).toBe(true);
    const full = (await get(`/api/match/demo/events?at_ms=${MATCH_MS}`)).body.payload;
    expect(full.recap).toMatchObject({
      headline: 'Full-time: Vellmouth Rovers 2 – 1 Kestrin Athletic',
      summary: expect.stringContaining('52′ disallowed for offside')
    });
    const fullKo = (await get(`/api/match/demo/events?at_ms=${MATCH_MS}&lang=ko`)).body.payload;
    expect(fullKo.recap.headline).toContain('경기 종료');
  });

  it('rejects a clock outside the match', async () => {
    for (const bad of ['-1', 'abc', String(MATCH_MS + 1), '1e6']) {
      const { status, body } = await get(`/api/match/demo/events?at_ms=${bad}`);
      expect(status).toBe(400);
      expect(body.error.code).toBe('bad_request');
    }
  });
});

// PRD metric "synthetic realism": every generated match stays inside the documented reference ranges.
describe('synthetic realism', () => {
  const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
  const count = (list: typeof events, type: string) => list.filter((e) => e.type === type).length;

  it.each(Object.keys(REFERENCE_RANGES.match) as Array<keyof typeof REFERENCE_RANGES.match>)('keeps %s per match inside its range for 200 seeds', (key) => {
    const [min, max] = REFERENCE_RANGES.match[key];
    for (const seed of SEEDS) {
      const match = generateScenario(seed, sheets);
      // Goals are shots too, so attempts count both.
      const value = key === 'attempts' ? count(match, 'shot') + count(match, 'goal') : count(match, key === 'subs' ? 'sub' : key.replace(/s$/, ''));
      expect(value, `seed ${seed}`).toBeGreaterThanOrEqual(min);
      expect(value, `seed ${seed}`).toBeLessThanOrEqual(max);
    }
  });

  it('spreads play over both halves and keeps every event inside the 90 minutes', () => {
    const [low, high] = REFERENCE_RANGES.firstHalfShare;
    for (const seed of SEEDS) {
      const play = generateScenario(seed, sheets).filter((e) => !['kickoff', 'half_time', 'full_time'].includes(e.type));
      const share = play.filter((e) => e.at_ms < MATCH_MS / 2).length / play.length;
      expect(share, `seed ${seed}`).toBeGreaterThanOrEqual(low);
      expect(share, `seed ${seed}`).toBeLessThanOrEqual(high);
      expect(play.every((e) => e.at_ms > 0 && e.at_ms < MATCH_MS)).toBe(true);
    }
  });
});
