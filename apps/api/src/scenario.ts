// Synthetic matchday-9 scenario: authored key moments plus seeded filler events. The whole match is labelled synthetic upstream.
export type EventType = 'kickoff' | 'shot' | 'goal' | 'foul' | 'yellow' | 'sub' | 'half_time' | 'full_time';
export interface PassStep { from: string; to: string; start_x: number; end_x: number }
export interface Buildup { passes: number; progress_m: number; chain: string[] }
export interface MatchEvent {
  id: string; at_ms: number; minute: number; type: EventType; club: string | null; player: string | null;
  assist?: string; player_off?: string; outcome?: 'saved' | 'off_target' | 'blocked';
  buildup?: Buildup; retracted?: boolean; retracted_at_ms?: number; retracted_reason?: string;
}
export interface TeamSheet { club: string; starters: string[]; bench: string[] }
export interface Snapshot { at_ms: number; minute: number; phase: 'pre' | 'first_half' | 'half_time' | 'second_half' | 'full_time'; score: Record<string, number>; events: MatchEvent[] }

export function computeBuildup(steps: PassStep[], direction: 1 | -1 = 1): Buildup {
  const progress_m = steps.reduce((sum, p) => sum + Math.max(0, direction * (p.end_x - p.start_x)), 0);
  const chain: string[] = [];
  for (const p of steps) {
    if (chain.at(-1) !== p.from) chain.push(p.from);
    if (chain.at(-1) !== p.to) chain.push(p.to);
  }
  return { passes: steps.length, progress_m, chain };
}

export const MINUTE_MS = 60_000;
export const MATCH_MS = 90 * MINUTE_MS;
const HALF_MS = 45 * MINUTE_MS;
// Reference ranges for a 90-minute top-flight match, both teams together, used by the synthetic realism tests (metric
// "synthetic realism"). They are deliberately wide plausibility bands chosen for this demo from general football
// knowledge, not figures from a cited dataset; see docs/design/evaluation.md.
export const REFERENCE_RANGES = {
  match: { goals: [0, 7], attempts: [14, 36], fouls: [14, 32], yellows: [0, 8], subs: [0, 10] },
  // Share of in-play events before half-time.
  firstHalfShare: [0.3, 0.7]
} as const;
// Filler shots plus the authored goals give 20 attempts, inside the attempts range.
const FILLER = { shot: 16, foul: 18, yellow: 3 };
const OUTCOMES = ['saved', 'off_target', 'blocked'] as const;

// The story the demo tells: an early captain's goal, an equaliser, a 52nd-minute goal disallowed at 55′ for offside, then a substitute scoring eight minutes after coming on.
interface Moment { minute: number; type: 'goal' | 'sub'; side: 0 | 1; player: string; assist?: string; player_off?: string; buildup?: Buildup; retracted_at_ms?: number; retracted_reason?: string }
const AUTHORED: Moment[] = [
  { minute: 12, type: 'goal', side: 0, player: 'p-go', assist: 'p-hale', buildup: computeBuildup([{ from: 'p-rosk', to: 'p-hale', start_x: 20, end_x: 50 }, { from: 'p-hale', to: 'p-go', start_x: 50, end_x: 70 }, { from: 'p-go', to: 'p-go', start_x: 70, end_x: 85 }], 1) },
  { minute: 38, type: 'goal', side: 1, player: 'p-calado', assist: 'p-varga', buildup: computeBuildup([{ from: 'p-okoye', to: 'p-ansah', start_x: 82, end_x: 60 }, { from: 'p-ansah', to: 'p-varga', start_x: 60, end_x: 42 }, { from: 'p-varga', to: 'p-calado', start_x: 42, end_x: 24 }], -1) },
  { minute: 52, type: 'goal', side: 0, player: 'p-marlow', assist: 'p-penn-ade', retracted_at_ms: 55 * MINUTE_MS, retracted_reason: 'Offside in the build-up', buildup: computeBuildup([{ from: 'p-barrault', to: 'p-penn-ade', start_x: 40, end_x: 64 }, { from: 'p-penn-ade', to: 'p-marlow', start_x: 64, end_x: 82 }], 1) },
  { minute: 58, type: 'sub', side: 0, player: 'p-navarre', player_off: 'p-velde' },
  { minute: 66, type: 'goal', side: 0, player: 'p-navarre', assist: 'p-go', buildup: computeBuildup([{ from: 'p-hale', to: 'p-go', start_x: 34, end_x: 62 }, { from: 'p-go', to: 'p-navarre', start_x: 62, end_x: 88 }], 1) },
  { minute: 74, type: 'sub', side: 1, player: 'p-lind', player_off: 'p-adebanjo' }
];

// mulberry32, the same generator as scripts/world/generate.mjs, so a seed reproduces the same match.
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Football minutes count up: 12:00 is the 12th minute, 12:30 the 13th.
const minuteOf = (atMs: number) => Math.max(1, Math.ceil(atMs / MINUTE_MS));

// Players on the pitch for a side at a given time, after the authored substitutions so far.
function onPitch(sheet: TeamSheet, side: 0 | 1, atMs: number) {
  const subs = AUTHORED.filter((m) => m.type === 'sub' && m.side === side && m.minute * MINUTE_MS <= atMs);
  return sheet.starters.filter((id) => !subs.some((s) => s.player_off === id)).concat(subs.map((s) => s.player));
}

export function generateScenario(seed: number, sheets: [TeamSheet, TeamSheet]): MatchEvent[] {
  for (const m of AUTHORED) {
    const sheet = sheets[m.side];
    const squad = [...sheet.starters, ...sheet.bench];
    if (![m.player, m.assist, m.player_off, ...(m.buildup?.chain ?? [])].every((id) => id === undefined || squad.includes(id))) throw new Error(`Scenario player missing from the ${sheet.club} team sheet at ${m.minute}'.`);
  }
  const rng = makeRng(seed);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rng() * list.length)];
  const draft: Array<Omit<MatchEvent, 'id' | 'minute'>> = [
    { at_ms: 0, type: 'kickoff', club: null, player: null },
    { at_ms: HALF_MS, type: 'half_time', club: null, player: null },
    { at_ms: MATCH_MS, type: 'full_time', club: null, player: null },
    ...AUTHORED.map(({ minute, side, ...m }) => ({ ...m, at_ms: minute * MINUTE_MS, club: sheets[side].club }))
  ];
  // One event per minute keeps the ticker readable; filler never lands on an authored minute.
  const taken = new Set(draft.map((e) => minuteOf(e.at_ms)));
  for (const [type, count] of Object.entries(FILLER) as Array<[keyof typeof FILLER, number]>) {
    for (let i = 0; i < count; i += 1) {
      let minute = 2 + Math.floor(rng() * 88);
      while (taken.has(minute)) minute = minute >= 89 ? 2 : minute + 1;
      taken.add(minute);
      const side = (rng() < 0.5 ? 0 : 1) as 0 | 1;
      const at = (minute - 1) * MINUTE_MS + (1 + Math.floor(rng() * 58)) * 1000;
      draft.push({ at_ms: at, type, club: sheets[side].club, player: pick(onPitch(sheets[side], side, at)), ...(type === 'shot' ? { outcome: pick(OUTCOMES) } : {}) });
    }
  }
  return draft
    .sort((a, b) => a.at_ms - b.at_ms)
    .map((e, i) => ({ ...e, id: `e${String(i + 1).padStart(3, '0')}`, minute: minuteOf(e.at_ms) }));
}

// Only events at or before the clock; nothing later (including a later retraction) can leak into the response.
export function snapshotAt(events: MatchEvent[], atMs: number, clubs: [string, string]): Snapshot {
  const seen = events
    .filter((e) => e.at_ms <= atMs)
    .map(({ retracted_at_ms, retracted_reason, ...e }) => (
      retracted_at_ms !== undefined
        ? (atMs >= retracted_at_ms ? { ...e, retracted: true, retracted_at_ms, retracted_reason } : { ...e, retracted: false })
        : e
    ));
  const score = Object.fromEntries(clubs.map((c) => [c, seen.filter((e) => e.type === 'goal' && !e.retracted && e.club === c).length]));
  const phase = atMs <= 0 ? 'pre' : atMs >= MATCH_MS ? 'full_time' : atMs === HALF_MS ? 'half_time' : atMs < HALF_MS ? 'first_half' : 'second_half';
  return { at_ms: atMs, minute: atMs <= 0 ? 0 : minuteOf(atMs), phase, score, events: seen };
}
