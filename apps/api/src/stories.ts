import type { Catalog } from './catalog.js';
import type { Buildup, MatchEvent, Snapshot } from './scenario.js';
import type { Passage } from './retrieval.js';

export type Lang = 'en' | 'ko';
export type Depth = 'short' | 'detailed';
export interface Recap { headline: string; summary: string; sources: Array<{ ref: string; label: string }> }

// Studio story candidates for match moments (goals and substitutions). The template copy is the verified fallback:
// match facts come from the synthetic event, background from the authored world pack, and the two never share a sentence.
export interface MomentTemplate { id: string; minute: number; type: 'goal' | 'sub'; short: string; long: string; buildup?: Buildup; evidence: Passage[] }

export const STORY_TYPES = new Set<MatchEvent['type']>(['goal', 'sub']);

// Recovery demonstration: the first sentence of the template with its first figure raised by 2, then by 4.
// Neither figure is in the evidence, so the reviewer rejects both and the run falls back to the template.
export function wrongDrafts(long: string): [string, string] {
  const first = `${long.split('. ')[0].replace(/\.$/, '')}.`;
  const raise = (k: number) => first.replace(/\d+/, (n) => String(Number(n) + k));
  return [raise(2), raise(4)];
}
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 >= 11 && n % 100 <= 13) || n % 10 > 3 ? 0 : n % 10]}`;

export function momentTemplate(catalog: Catalog, events: MatchEvent[], event: MatchEvent, passages: Map<string, Passage>, opts: { lang?: Lang; depth?: Depth } = {}): MomentTemplate {
  const lang = opts.lang ?? 'en';
  const depth = opts.depth ?? 'short';
  const name = (id: string | null | undefined) => catalog.people.players.find((p) => p.id === id)?.name ?? 'Unknown';
  const club = catalog.league.clubs.find((c) => c.id === event.club);
  const season = (id: string) => catalog.statistics.summaries.players[id]?.current_season as { goals: number; appearances: number } | null | undefined;
  const before = (id: string) => {
    const s = season(id);
    if (!s) return null;
    return lang === 'ko'
      ? `오늘 경기 전까지 ${name(id)} 선수는 이번 시즌 리그 ${s.appearances}경기 ${s.goals}골을 기록했습니다 (월드 팩).`
      : `Before today, ${name(id)} had ${s.goals} league goal${s.goals === 1 ? '' : 's'} in ${s.appearances} game${s.appearances === 1 ? '' : 's'} this season (seeded world pack).`;
  };
  const player = event.player!;
  let short: string;
  let facts: string;
  if (event.type === 'goal') {
    const count = events.filter((e) => e.type === 'goal' && !(e.retracted_at_ms && e.retracted_at_ms <= event.at_ms) && e.player === player && e.at_ms <= event.at_ms).length;
    const chainNames = event.buildup?.chain.map(name).join(' → ');
    if (lang === 'ko') {
      short = `골 ${event.minute}′ · ${name(player)} (${club?.short})`;
      const buildupKo = depth === 'detailed' && event.buildup ? ` 빌드업: 패스 ${event.buildup.passes}회로 ${event.buildup.progress_m}m 전진 (${chainNames}).` : '';
      facts = `${name(player)} 선수가 ${event.minute}분에 ${club?.name}의 골을 기록했습니다${event.assist ? ` (도움: ${name(event.assist)})` : ''}.${buildupKo} 이번 경기 ${name(player)}의 ${count}번째 골입니다 (합성 경기).`;
    } else {
      short = `GOAL ${event.minute}′ · ${name(player)} (${club?.short})`;
      const buildupEn = depth === 'detailed' && event.buildup ? ` Build-up: ${event.buildup.passes} passes advancing ${event.buildup.progress_m} m (${chainNames}).` : '';
      facts = `${name(player)} scored for ${club?.name} in the ${ordinal(event.minute)} minute${event.assist ? `, set up by ${name(event.assist)}` : ''}.${buildupEn} It is goal number ${count} for ${name(player)} in this match (synthetic match).`;
    }
  } else if (lang === 'ko') {
    short = `교체 ${event.minute}′ · ${name(player)} 투입, ${name(event.player_off)} 아웃`;
    facts = `${name(player)} 선수가 ${event.minute}분에 ${name(event.player_off)} 대신 ${club?.name} 소속으로 투입되었습니다 (합성 경기).`;
  } else {
    short = `SUB ${event.minute}′ · ${name(player)} on, ${name(event.player_off)} off`;
    facts = `${name(player)} came on for ${name(event.player_off)} for ${club?.name} in the ${ordinal(event.minute)} minute (synthetic match).`;
  }
  const long = [facts, before(player)].filter(Boolean).join(' ');
  // The season-by-season statistics stay out: their many figures would let a wrong number in an edit pass the check.
  const refs = [`player:${player}`, event.assist && `player:${event.assist}`, event.player_off && `player:${event.player_off}`, `club:${event.club}`];
  const evidence: Passage[] = [
    { ref: `event:${event.id}`, label: `Synthetic match event, ${event.minute}′`, text: long },
    ...refs.flatMap((ref) => (ref && passages.get(ref)) || [])
  ];
  return { id: event.id, minute: event.minute, type: event.type as 'goal' | 'sub', short, long, ...(event.buildup ? { buildup: event.buildup } : {}), evidence };
}

export function buildRecap(catalog: Catalog, snapshot: Snapshot, clubs: [string, string], lang: Lang = 'en'): Recap | null {
  if (snapshot.phase !== 'full_time') return null;
  const name = (id: string | null) => catalog.people.players.find((p) => p.id === id)?.name ?? 'Unknown';
  const clubName = (id: string) => catalog.league.clubs.find((c) => c.id === id)?.name ?? id;
  const [home, away] = clubs;
  const goals = snapshot.events.filter((e) => e.type === 'goal' && !e.retracted);
  const retracted = snapshot.events.filter((e) => e.type === 'goal' && e.retracted);
  const attempts = snapshot.events.filter((e) => e.type === 'shot' || e.type === 'goal').length;
  const scorers = goals.map((e) => `${name(e.player)} ${e.minute}′`).join(', ');
  if (lang === 'ko') {
    const dis = retracted.map((e) => `${name(e.player)} ${e.minute}′ 오프사이드 취소`).join(', ');
    return {
      headline: `경기 종료: ${clubName(home)} ${snapshot.score[home]} – ${snapshot.score[away]} ${clubName(away)}`,
      summary: `득점: ${scorers || '없음'}.${dis ? ` (${dis}).` : ''} 총 슈팅 ${attempts}회 (합성 경기).`,
      sources: [{ ref: `events@${snapshot.at_ms}`, label: '합성 경기 종료 기록' }]
    };
  }
  const dis = retracted.map((e) => `${name(e.player)} ${e.minute}′ disallowed for offside`).join(', ');
  return {
    headline: `Full-time: ${clubName(home)} ${snapshot.score[home]} – ${snapshot.score[away]} ${clubName(away)}`,
    summary: `Goals: ${scorers || 'none'}.${dis ? ` (${dis}).` : ''} Total attempts: ${attempts} (synthetic match).`,
    sources: [{ ref: `events@${snapshot.at_ms}`, label: 'Synthetic match full-time events' }]
  };
}
