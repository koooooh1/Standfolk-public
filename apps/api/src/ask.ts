import type { Catalog, Club, Player } from './catalog.js';
import type { MatchEvent } from './scenario.js';

// Template answers for the Ask tab. Every figure comes from the world pack or the events up to the clock.
// shortcut: keyword intents only. The agent service can reword an answer; the API gate in agentClient.ts decides whether it is shown.
export interface AskSubject { kind: 'player' | 'club'; id: string }
export interface AskResult { answer: string; answered: boolean; subject: AskSubject | null; sources: Array<{ label: string; ref: string }>; engine: 'template' | 'agents' }
export type AskLanguage = 'en' | 'ko';
type Source = AskResult['sources'][number];
type Reply = (text: string, subject: AskSubject | null, sources: Source[], answered?: boolean) => AskResult;

const lower = (s: string) => s.toLowerCase();
const words = (s: string) => lower(s).split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
const minutes = (events: MatchEvent[]) => events.map((e) => `${e.minute}′`).join(', ');
const playerDisplayName = (p: Player, lang: AskLanguage) => lang === 'ko' && typeof p.native_name === 'string' && /[\uac00-\ud7a3]/u.test(p.native_name) ? p.native_name : p.name;
const clubDisplayName = (c: Club, lang: AskLanguage) => lang === 'ko' ? ({ vr: '벨머스 로버스', ka: '케스트린 애슬레틱' } as Record<string, string>)[c.id] ?? c.name : c.name;
const topicParticle = (name: string) => {
  const last = name.at(-1) ?? '';
  const code = last.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 0 ? '는' : code >= 0xac00 && code <= 0xd7a3 ? '은' : '은(는)';
};
const CLUB_CULTURE_KO: Record<string, { title: string; text: string }> = {
  'club-vr-03': { title: '물결 종의 노래', text: '홈에서 골이 터지면 북쪽 스탠드가 오래된 항구 종을 세 번 울린 뒤 느린 항구 노래를 부릅니다.' },
  'club-vr-08': { title: '페리 깃발', text: '서포터들은 구단 창단에 참여한 페리 선원들의 신호에서 따온 청록색 깃발을 흔듭니다.' },
  'club-vr-09': { title: '항구 산책길', text: '홈 팬들은 킥오프 전 항구 방파제를 따라 경기장으로 걸어갑니다.' },
  'club-ka-03': { title: '날개 인사', text: '선수단이 입장하면 서포터들이 양팔을 날개처럼 들어 올립니다.' },
  'club-ka-07': { title: '더 네스트', text: '밀뱅크 로드의 지붕 있는 관중석으로, 가장 열정적인 홈 팬들이 모입니다.' },
  'club-ka-08': { title: '교대 종소리', text: '창단을 이끈 노동자들의 교대 시간을 기리는 제분소 호루라기가 킥오프에 울립니다.' }
};

// Names in the question: full names first, then clubs, then surnames; a surname shared by two players is never guessed.
function findSubject(catalog: Catalog, question: string): AskSubject | 'ambiguous' | null {
  const q = lower(question);
  const tokens = words(question);
  const players = catalog.people.players;
  const full = players.find((p) => q.includes(lower(p.name)) || (typeof p.native_name === 'string' && q.includes(lower(p.native_name))));
  if (full) return { kind: 'player', id: full.id };
  const koreanClubNames: Record<string, string[]> = { vr: ['벨머스 로버스', '벨머스'], ka: ['케스트린 애슬레틱', '케스트린'] };
  const club = catalog.league.clubs.find((c) => q.includes(lower(c.name)) || tokens.includes(lower(c.short)) || (koreanClubNames[c.id] ?? []).some((name) => q.includes(name)));
  if (club) return { kind: 'club', id: club.id };
  const bySurname = players.filter((p) => tokens.includes(lower(p.name.split(' ').at(-1)!)));
  if (bySurname.length > 1) return 'ambiguous';
  return bySurname[0] ? { kind: 'player', id: bySurname[0].id } : null;
}

export function answer(catalog: Catalog, events: MatchEvent[], clubs: [string, string], question: string, atMs: number, given: AskSubject | null, lang: AskLanguage = 'en'): AskResult {
  const q = lower(question);
  const korean = lang === 'ko';
  const reply: Reply = (text, subject, sources, answered = true) => ({ answer: text, answered, subject, sources, engine: 'template' });
  const found = given ?? findSubject(catalog, question);
  if (found === 'ambiguous') return reply(korean ? '같은 성을 가진 선수가 여럿 있습니다. 이름도 함께 입력해 주세요.' : 'More than one player has that surname. Add the first name.', null, [], false);

  const clock: Source = { label: korean ? `현재 ${Math.ceil(atMs / 60_000)}′까지의 경기 기록` : `Synthetic match events up to ${Math.ceil(atMs / 60_000)}′`, ref: `events@${atMs}` };
  const goals = events.filter((e) => e.at_ms <= atMs && e.type === 'goal' && !(e.retracted_at_ms && e.retracted_at_ms <= atMs));
  const player = found?.kind === 'player' ? catalog.people.players.find((p) => p.id === found.id) : undefined;
  const club = found?.kind === 'club' ? catalog.league.clubs.find((c) => c.id === found.id) : undefined;
  if (player) return answerPlayer(catalog, player, q, goals.filter((e) => e.player === player.id), clock, reply, lang);
  if (club) return answerClub(catalog, club, q, goals.filter((e) => e.club === club.id), clock, reply, lang);

  if (/\bscore|scored|winning|result\b|점수|스코어|몇\s*대|경기\s*결과|누가\s*이기/.test(q)) {
    if (atMs === 0) return reply(korean ? '경기가 아직 시작되지 않았습니다.' : 'The match has not started yet.', null, [clock]);
    const name = (id: string | null) => { const player = catalog.people.players.find((p) => p.id === id); return player ? playerDisplayName(player, lang) : 'Unknown'; };
    const line = clubs.map((id) => { const club = catalog.league.clubs.find((x) => x.id === id); return `${club ? clubDisplayName(club, lang) : id} ${goals.filter((e) => e.club === id).length}`; }).join(korean ? ' 대 ' : ', ');
    const scorers = goals.map((e) => `${name(e.player)} ${e.minute}′`).join(', ');
    return reply(korean ? `${line}. ${scorers ? `득점: ${scorers}.` : '아직 득점이 없습니다.'}` : `${line}.${scorers ? ` Goals: ${scorers}.` : ' No goals yet.'}`, null, [clock]);
  }
  return reply(korean
    ? '점수, 선수의 득점·발음·나이·국적·주장 경력, 구단의 역사·경기장에 관해 답할 수 있습니다. 질문에 선수나 구단 이름을 포함해 주세요.'
    : 'I can answer about the score, a player (goals, pronunciation, age, country, captaincy), or a club (history, ground, goals today). Name the player or club in your question.', null, [], false);
}

function answerPlayer(catalog: Catalog, p: Player, q: string, goals: MatchEvent[], clock: Source, reply: Reply, lang: AskLanguage): AskResult {
  const korean = lang === 'ko';
  const name = playerDisplayName(p, lang);
  const subject: AskSubject = { kind: 'player', id: p.id };
  const record: Source = { label: korean ? `${p.name}: 선수 기록` : `${p.name}: authored player record`, ref: `player:${p.id}` };
  if (/pronounc|\bsay\b|\bsaid\b|발음|어떻게\s*(읽|말|부르)/.test(q)) {
    const native = p.native_name ? (korean ? ` 한글 이름은 ${p.native_name as string}입니다.` : ` Native spelling: ${p.native_name as string}.`) : '';
    return reply(p.pronunciation ? (korean ? `${name}의 발음은 ${p.pronunciation as string}입니다.${native}` : `Say it ${p.pronunciation as string}.${native}`) : (korean ? `${name}은 영어 표기대로 발음합니다.` : `${name} is said as written in English.`), subject, [record]);
  }
  if (/goal|scor|골|득점/.test(q)) {
    const season = catalog.statistics.summaries.players[p.id]?.current_season as { goals: number; appearances: number } | null | undefined;
    const today = korean
      ? goals.length ? `오늘 경기 ${goals.length}골 (${minutes(goals)})` : '오늘 경기 득점 없음'
      : goals.length ? `${goals.length} in this match so far (${minutes(goals)})` : 'no goals in this match so far';
    const before = season ? (korean ? ` 이번 시즌 오늘 경기 전까지 리그 ${season.appearances}경기 ${season.goals}골` : `, and ${season.goals} in ${season.appearances} league games this season before today`) : '';
    return reply(korean ? `${name}: ${today}.${before}` : `${name}: ${today}${before}.`, subject, [clock, { label: korean ? '시즌 통계 (시드 데이터)' : 'Season statistics (seeded world pack)', ref: `stats:${p.id}` }]);
  }
  if (/\bage\b|how old|born|나이|몇\s*살|출생/.test(q)) return reply(korean ? `${name}${topicParticle(name)} ${(p.age as { years: number }).years}세입니다.` : `${name} is ${(p.age as { years: number }).years}.`, subject, [record]);
  if (/from|country|nation|caps|international|어느\s*나라|국적|출신|대표팀|국대|출전/.test(q)) {
    const team = p.national_team as { team: string; level: string; caps: number; goals: number } | null | undefined;
    const nationality = korean ? (NATIONALITY_KO[p.nationality] ?? p.nationality) : p.nationality;
    const caps = team ? (korean ? ` ${team.team} ${team.level === 'senior' ? '성인 대표팀' : team.level}: ${team.caps}경기 ${team.goals}골 (가상 기록).` : ` ${team.team} ${team.level}: ${team.caps} caps, ${team.goals} goals (fictional record).`) : '';
    return reply(korean ? `${name}${topicParticle(name)} ${nationality} 출신입니다.${caps}` : `${name} is from ${nationality}.${caps}`, subject, [record]);
  }
  if (/captain|주장|캡틴/.test(q)) return reply(p.captain_since
    ? (korean ? `${name}${topicParticle(name)} ${p.captain_since as string}부터 주장을 맡고 있습니다.` : `${name} has been captain since ${p.captain_since as string}.`)
    : (korean ? `${name}${topicParticle(name)} 현재 주장이 아닙니다.` : `${name} is not the captain.`), subject, [record]);
  if (/career|journey|loan|before|previous|경력|여정|임대|이전\s*소속|예전\s*구단/.test(q)) {
    const career = (p.home_career as Array<{ where: string; years: string; apps: number; goals: number }> | undefined) ?? [];
    const loans = (p.loans as Array<{ club: string; season: string }> | undefined) ?? [];
    const current = catalog.league.clubs.find((c) => c.id === p.club);
    const currentClub = current ? clubDisplayName(current, lang) : p.club;
    const clubName = (id: string) => { const club = catalog.league.clubs.find((c) => c.id === id); return club ? clubDisplayName(club, lang) : id; };
    const origin = p.from === 'academy'
      ? (korean ? '구단 유소년 아카데미 출신입니다.' : 'Came through the club academy.')
      : (korean ? `${p.from ? clubName(String(p.from)) : '다른 구단'}에서 ${p.joined}년에 ${currentClub}으로 합류했습니다.` : `Joined ${currentClub} in ${p.joined}${p.from ? ` from ${clubName(String(p.from))}` : ' from another club'}.`);
    const past = career.map((c) => korean ? `${c.where} (${c.years}, ${c.apps}경기 ${c.goals}골)` : `${c.where} (${c.years}, ${c.apps} apps, ${c.goals} goals)`);
    const loanText = loans.map((l) => korean ? `${clubName(l.club)} (${l.season}) 임대` : `loan at ${clubName(l.club)} (${l.season})`);
    const history = [...past, ...loanText].join(korean ? ', ' : '; ');
    return reply(korean ? `${name}${topicParticle(name)} ${origin}${history ? ` 이전 경력은 ${history}입니다.` : ''}` : `${name}: ${origin}${history ? ` Previous spells: ${history}.` : ''}`, subject, [record]);
  }
  return reply(korean ? `${name}의 득점, 발음, 나이, 국적, 주장 경력을 알려드릴 수 있습니다.` : `About ${name} I can tell you goals, pronunciation, age, country, or captaincy.`, subject, [], false);
}

function answerClub(catalog: Catalog, c: Club, q: string, goals: MatchEvent[], clock: Source, reply: Reply, lang: AskLanguage): AskResult {
  const korean = lang === 'ko';
  const subject: AskSubject = { kind: 'club', id: c.id };
  const name = clubDisplayName(c, lang);
  const record: Source = { label: korean ? `${c.name}: 구단 기록` : `${c.name}: authored club record`, ref: `club:${c.id}` };
  const cultureQuestion = /chant|song|culture|supporter|fan|응원|노래|문화|관중석|서포터/.test(q);
  if (!cultureQuestion && /goal|scor|골|득점/.test(q)) return reply(korean ? `${name}${topicParticle(name)} 오늘 경기에서 ${goals.length}골을 기록했습니다.` : `${name} have ${goals.length} goal${goals.length === 1 ? '' : 's'} in this match so far.`, subject, [clock]);
  if (cultureQuestion) {
    const content = catalog.content.featured[c.id] as { culture?: Array<{ title: string; text: string; src?: string; kind?: string }> } | undefined;
    const index = content?.culture?.findIndex((item) => item.kind === 'chant_background') ?? -1;
    const item = index >= 0 ? content?.culture?.[index] : undefined;
    if (!item) return reply(korean ? `${name}의 응원 문화 자료는 아직 등록되지 않았습니다.` : `No supporter-culture record is available for ${name}.`, subject, [record]);
    const localized = item.src ? CLUB_CULTURE_KO[item.src] : undefined;
    const label = korean ? `${name}: 구단 문화` : `${name}: club culture`;
    return reply(korean ? localized?.text ?? `${name}의 응원 문화 자료는 아직 한국어로 제공되지 않습니다.` : `${item.title}: ${item.text}`, subject, [{ label, ref: `club:${c.id}:culture:${index}` }]);
  }
  if (/found|history|since|창단|설립|역사|언제\s*생/.test(q)) return reply(korean ? `${name}${topicParticle(name)} ${c.founded as number}년에 창단했습니다.` : `${name} were founded in ${c.founded as number}.`, subject, [record]);
  if (/ground|stadium|play|capacity|경기장|구장|수용\s*인원|홈구장/.test(q)) return reply(korean ? `${name}의 홈구장은 ${c.ground as string}이며 수용 인원은 ${(c.capacity as number).toLocaleString('ko-KR')}명입니다.` : `${name} play at ${c.ground as string} (capacity ${(c.capacity as number).toLocaleString('en-GB')}).`, subject, [record]);
  return reply(korean ? `${name}의 오늘 경기 득점, 역사, 홈구장을 알려드릴 수 있습니다.` : `About ${name} I can tell you goals today, history, or ground.`, subject, [], false);
}

const NATIONALITY_KO: Record<string, string> = {
  England: '잉글랜드', Scotland: '스코틀랜드', Wales: '웨일스', 'Northern Ireland': '북아일랜드', Ireland: '아일랜드',
  Czechia: '체코', Slovakia: '슬로바키아', Israel: '이스라엘', France: '프랑스', Morocco: '모로코', Japan: '일본', Uruguay: '우루과이',
  Ghana: '가나', Netherlands: '네덜란드', Spain: '스페인', Denmark: '덴마크', Argentina: '아르헨티나', Nigeria: '나이지리아',
  Hungary: '헝가리', Belgium: '벨기에', Norway: '노르웨이', Sweden: '스웨덴', Portugal: '포르투갈', Croatia: '크로아티아',
  Poland: '폴란드', Finland: '핀란드', 'Korea Republic': '대한민국', 'South Korea': '대한민국'
};
