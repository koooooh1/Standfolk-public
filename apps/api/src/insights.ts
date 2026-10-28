import type { Catalog, Json, Player } from './catalog.js';

// Pre-match insights computed only from the catalog: season comparison, streaks, leaders, and club stories.
type Match = { season: string; matchday: number; home: string; away: string; hg: number; ag: number };
type Brief = { id: string; name: string; number: number; pos: string } & Json;
type Lang = 'en' | 'ko';

const LEADER_CATEGORIES = ['goals', 'assists', 'shots', 'fouls', 'value', 'height'] as const;
const LEADERS = 5;

function resultsOf(catalog: Catalog, club: string): Array<{ for: number; against: number; season: string; matchday: number }> {
  return catalog.league.seasons
    .flatMap((s) => (s.featured_matches as Match[] | undefined) ?? [])
    .filter((m) => m.home === club || m.away === club)
    .map((m) => ({ season: m.season, matchday: m.matchday, for: m.home === club ? m.hg : m.ag, against: m.home === club ? m.ag : m.hg }));
}

const runLength = <T>(items: T[], test: (item: T) => boolean) => {
  let n = 0;
  for (let i = items.length - 1; i >= 0 && test(items[i]); i -= 1) n += 1;
  return n;
};

export function streaks(catalog: Catalog, club: string, lang: Lang = 'en') {
  const results = resultsOf(catalog, club);
  const last5 = results.slice(-5);
  const items = [
    { id: 'unbeaten', label: 'Unbeaten run', value: runLength(results, (r) => r.for >= r.against), unit: 'matches' },
    { id: 'wins', label: 'Winning run', value: runLength(results, (r) => r.for > r.against), unit: 'matches' },
    { id: 'scoring', label: 'Scored in', value: runLength(results, (r) => r.for > 0), unit: 'in a row' },
    { id: 'clean', label: 'Clean sheets', value: last5.filter((r) => r.against === 0).length, unit: 'of last 5' },
    { id: 'over', label: 'Over 2.5 goals', value: last5.filter((r) => r.for + r.against > 2).length, unit: 'of last 5' }
  ];
  if (lang === 'en') return items;
  const labels: Record<string, string> = { unbeaten: '무패 행진', wins: '연승', scoring: '연속 득점', clean: '무실점 경기', over: '2.5골 초과 경기' };
  const units: Record<string, string> = { matches: '경기', 'in a row': '경기 연속', 'of last 5': '최근 5경기 중' };
  return items.map((item) => ({ ...item, label: labels[item.id], unit: units[item.unit] }));
}

export function comparison(catalog: Catalog, club: string, players: Player[]) {
  const season = catalog.league.seasons.at(-1)!;
  const row = season.table.find((r) => r.club === club) as (Json & { played: number; points: number; gf: number; ga: number }) | undefined;
  const sheets = resultsOf(catalog, club).filter((r) => r.season === season.season && r.against === 0).length;
  const ages = players.map((p) => (p.age as { years: number }).years);
  const value = players.reduce((sum, p) => sum + (p.market_value_eur_m as number), 0);
  return {
    points: row?.points ?? 0, goals_for: row?.gf ?? 0, goals_against: row?.ga ?? 0, clean_sheets: sheets, played: row?.played ?? 0,
    average_age: Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10,
    squad_value_eur_m: Math.round(value * 10) / 10
  };
}

export function leaders(catalog: Catalog, players: Player[], brief: (p: Player) => Brief) {
  const season = catalog.league.league.current_season;
  const line = (p: Player) => (catalog.statistics.player_seasons.find((r) => r.player === p.id && r.season === season) ?? {}) as Record<string, number>;
  const score = (p: Player, category: (typeof LEADER_CATEGORIES)[number]) => {
    if (category === 'value') return p.market_value_eur_m as number;
    if (category === 'height') return p.height_cm as number;
    return line(p)[category] ?? 0;
  };
  return Object.fromEntries(LEADER_CATEGORIES.map((category) => [
    category,
    [...players].sort((a, b) => score(b, category) - score(a, category)).slice(0, LEADERS).map((p) => ({ ...brief(p), value: score(p, category) }))
  ]));
}

const STORY_KO: Record<string, { title: string; text: string }> = {
  'club-vr-01': { title: '항구에서 시작된 구단', text: '페리 선원들이 벨머스 항구 방파제에서 구단을 창단했습니다.' },
  'club-vr-02': { title: '바다를 마주한 홈구장', text: '바다를 마주한 키사이드 파크가 문을 열었습니다.' },
  'club-vr-03': { title: '물결 종의 노래', text: '홈에서 골이 터지면 북쪽 스탠드가 오래된 항구 종을 세 번 울린 뒤 느린 항구 노래를 부릅니다.' },
  'club-vr-04': { title: '하구 더비의 시작', text: '케스트린 애슬레틱과 첫 리그 맞대결을 치렀고, 하구 더비가 시작됐습니다.' },
  'club-vr-05': { title: '첫 리그 우승', text: '브렌무어 리그에서 첫 우승을 차지했습니다.' },
  'club-vr-06': { title: '마지막 날에 거둔 우승', text: '최종전에서 승리하며 두 번째 리그 우승을 차지했습니다.' },
  'club-vr-07': { title: '세 번째 컵 우승', text: '결승에서 할로필드 유나이티드를 꺾고 세 번째 브렌무어 컵을 들어 올렸습니다.' },
  'club-ka-01': { title: '하구 남쪽에서 시작된 구단', text: '하구 남쪽 강변의 제분소 노동자들이 구단을 창단했습니다.' },
  'club-ka-03': { title: '날개 인사', text: '선수단이 입장하면 서포터들이 양팔을 날개처럼 들어 올립니다.' },
  'club-ka-04': { title: '첫 라이벌전', text: '벨머스 로버스와 첫 리그 맞대결을 치렀습니다.' },
  'club-ka-05': { title: '브렌무어 컵 우승', text: '첫 브렌무어 컵을 들어 올렸습니다.' },
  'club-ka-06': { title: '챔피언십으로 강등', text: '브렌무어 챔피언십으로 강등됐습니다.' },
  'club-ka-07': { title: '더 네스트', text: '밀뱅크 로드의 지붕 있는 관중석으로, 가장 열정적인 홈 팬들이 모입니다.' },
  'club-ka-08': { title: '교대 종소리', text: '창단을 이끈 노동자들의 교대 시간을 기리는 제분소 호루라기가 킥오프에 울립니다.' }
};

export function stories(catalog: Catalog, club: string, players: Player[], lang: Lang = 'en') {
  const content = catalog.content.featured[club] as { history: Array<{ year: number; text: string; src: string }>; culture: Array<{ title: string; text: string; src: string }> } | undefined;
  const captain = players.find((p) => p.captain_since !== undefined && !p.vice_captain_since);
  const finishes = (catalog.statistics.summaries.clubs[club] as { finishes?: Array<{ season: string; division: string }> } | undefined)?.finishes ?? [];
  const items: Array<{ title: string; text: string; src: string }> = [];
  const lastUp = finishes.findLastIndex((f, i) => i > 0 && finishes[i - 1].division !== f.division && f.division === catalog.league.league.name);
  if (lastUp > 0) items.push(lang === 'ko'
    ? { title: `${finishes[lastUp].season} 시즌 1부 복귀`, text: `${finishes[lastUp].season} 시즌을 앞두고 ${catalog.league.league.second_tier === 'Brenmoor Championship' ? '브렌무어 챔피언십' : catalog.league.league.second_tier}에서 승격했습니다.`, src: 'league-seasons' }
    : { title: `Back in the top flight since ${finishes[lastUp].season}`, text: `Promoted from the ${catalog.league.league.second_tier} for ${finishes[lastUp].season}.`, src: 'league-seasons' });
  if (captain) {
    const name = lang === 'ko' && typeof captain.native_name === 'string' && /[\uac00-\ud7a3]/u.test(captain.native_name) ? captain.native_name : captain.name;
    items.push(lang === 'ko'
      ? { title: `${name} 주장`, text: `${captain.captain_since}부터 주장을 맡고 있습니다.`, src: `people:${captain.id}` }
      : { title: `${captain.name} leads the side`, text: `Captain since ${captain.captain_since}.`, src: `people:${captain.id}` });
  }
  for (const c of content?.culture.slice(0, 1) ?? []) items.push(c);
  for (const h of content?.history.slice(-2).reverse() ?? []) items.push({ title: String(h.year), text: h.text, src: h.src });
  return lang === 'ko' ? items.map((item) => STORY_KO[item.src] ? { ...item, ...STORY_KO[item.src] } : item) : items;
}
