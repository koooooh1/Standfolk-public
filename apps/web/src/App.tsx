import { useEffect, useState } from 'react';
import { CalendarDays, Gauge, Layers, MapPin, Mic, Star, Users } from 'lucide-react';
import { getJson, type DemoMatch, type Lang, type LeagueTable, type MatchSide, type Mode, type Prefs } from './api';
import { ordinal } from './ClubView';
import { Lineups } from './Lineups';
import { PlayerStatsTab, StatsTab, StoriesTab, StreaksTab } from './MatchTabs';
import { KeyMoments, ReplayBar, scorers, statusText, useReplay, type Replay } from './Replay';
import { AskBox } from './Ask';
import { Studio } from './Studio';
import { CrestImage } from './Portrait';
import { Settings, hasModeInUrl, readPrefs, savePrefs } from './Settings';
import { SidePanel, type Focus } from './SidePanel';
import { Discover } from './Discover';
import { displayClubName, displayGroundName, displayLeagueName, displaySurfaceName, displayTownName, tr } from './i18n';

type Tab = 'match' | 'discover' | 'stories' | 'players' | 'h2h' | 'table' | 'studio';
const FAN_TABS: Array<[Tab, string]> = [['match', 'Watch'], ['discover', 'Discover'], ['stories', 'Stories'], ['players', 'Players'], ['table', 'Table']];
const BROADCAST_TABS: Array<[Tab, string]> = [['studio', 'Studio'], ['match', 'Match monitor'], ['h2h', 'Head-to-head'], ['table', 'League table']];
type Sub = 'summary' | 'lineups' | 'stats' | 'players' | 'streaks' | 'stories';
const FAN_MATCH_SUBS: Array<[Sub, string]> = [['summary', 'Summary'], ['lineups', 'Line-ups'], ['stats', 'Stats'], ['streaks', 'Streaks']];
const BROADCAST_MATCH_SUBS: Array<[Sub, string]> = [['lineups', 'Line-ups'], ['stats', 'Stats'], ['players', 'Player stats']];
const kickoffText = (iso: string, lang: Lang) => new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(new Date(iso));
const timeText = (iso: string, lang: Lang) => new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(new Date(iso));

function useFollow() {
  const read = () => { try { return window.localStorage.getItem('standfolk.follow') === '1'; } catch { return false; } };
  const [isFollowing, setIsFollowing] = useState(read);
  const toggle = () => {
    setIsFollowing(!isFollowing);
    try { window.localStorage.setItem('standfolk.follow', isFollowing ? '0' : '1'); } catch { /* storage blocked: keep in memory */ }
  };
  return { isFollowing, toggle };
}

function AudienceContext({ mode, isHome, onOpenHome, lang }: { mode: Mode; isHome: boolean; onOpenHome: () => void; lang: Lang }) {
  const isBroadcast = mode === 'broadcast';
  const Icon = isBroadcast ? Mic : Users;
  return (
    <section className="audience-context" aria-label={tr(lang, 'Current audience', '현재 작업 화면')} aria-live="polite" data-mode={mode}>
      <Icon size={20} aria-hidden="true" />
      <div className="audience-context-copy">
        <strong>{isBroadcast ? tr(lang, 'Producer workspace', '방송 제작 작업 공간') : tr(lang, 'Fan matchday', '팬 경기 화면')}</strong>
        <span>{isBroadcast ? tr(lang, 'Evidence review, approvals and on-air output.', '근거 검토, 승인, 송출 결과를 관리합니다.') : tr(lang, 'Follow the match, discover stories and explore player journeys.', '경기를 보고 이야기와 선수 여정을 살펴보세요.')}</span>
      </div>
      {!isHome && (
        <button type="button" onClick={onOpenHome}>
          {isBroadcast ? tr(lang, 'Open Studio', '스튜디오 열기') : tr(lang, 'Back to Watch', '경기 화면으로 돌아가기')}
        </button>
      )}
    </section>
  );
}

function WorkspaceChooser({ onSelect, lang }: { onSelect: (mode: Mode) => void; lang: Lang }) {
  return (
    <main className="workspace-entry" aria-labelledby="workspace-title">
      <div className="workspace-entry-inner">
        <span className="workspace-brand">Standfolk <span>· {tr(lang, 'Matchday intelligence', '경기 정보 서비스')}</span></span>
        <p className="workspace-eyebrow">{tr(lang, 'ONE MATCH. TWO WORKSPACES.', '하나의 경기, 두 가지 화면')}</p>
        <h1 id="workspace-title">{tr(lang, 'Where are you joining from?', '어떤 화면으로 들어가시나요?')}</h1>
        <p className="workspace-intro">{tr(lang, 'Choose the experience built around your role.', '사용 목적에 맞는 화면을 선택하세요.')}</p>
        <div className="workspace-options">
          <section className="workspace-option workspace-fan">
            <Users size={28} aria-hidden="true" />
            <p className="workspace-eyebrow">{tr(lang, 'FOR SUPPORTERS', '팬을 위한 화면')}</p>
            <h2>{tr(lang, 'Fan', '팬')}</h2>
            <p>{tr(lang, 'Follow the match as it unfolds, then connect the moments to the people and stories behind it.', '경기를 보고 주요 장면을 선수와 구단 이야기로 이어서 살펴보세요.')}</p>
            <ul>
              <li>{tr(lang, 'Live match timeline and build-ups', '경기 타임라인과 득점 빌드업')}</li>
              <li>{tr(lang, 'Player journeys and club culture', '선수 여정과 구단 문화')}</li>
              <li>{tr(lang, 'Stories, stats and league context', '스토리, 기록, 리그 정보')}</li>
            </ul>
            <button type="button" onClick={() => onSelect('fan')}>{tr(lang, 'Enter Fan matchday', '팬 화면으로 입장')}</button>
          </section>
          <section className="workspace-option workspace-broadcast">
            <Mic size={28} aria-hidden="true" />
            <p className="workspace-eyebrow">{tr(lang, 'FOR PRODUCTION TEAMS', '중계 제작자를 위한 화면')}</p>
            <h2>{tr(lang, 'Broadcast Studio', '방송 스튜디오')}</h2>
            <p>{tr(lang, 'Turn match moments into sourced copy and review the graphic before it reaches the audience.', '경기 장면을 근거가 있는 문안으로 만들고 송출 전에 그래픽을 검토하세요.')}</p>
            <ul>
              <li>{tr(lang, 'Evidence-backed story queue', '근거가 연결된 스토리 대기열')}</li>
              <li>{tr(lang, 'Check, approve and take copy on air', '검증·승인 후 문안 송출')}</li>
              <li>{tr(lang, 'Preview overlays and corrections', '그래픽 미리보기와 정정')}</li>
            </ul>
            <button type="button" onClick={() => onSelect('broadcast')}>{tr(lang, 'Open Broadcast Studio', '방송 스튜디오 열기')}</button>
          </section>
        </div>
        <p className="workspace-footnote">{tr(lang, 'All clubs, players and match events in this demo are fictional.', '이 데모의 구단·선수·경기 기록은 모두 가상입니다.')}</p>
      </div>
    </main>
  );
}

function TeamName({ side, align, onFocus, lang }: { side: MatchSide; align: 'home' | 'away'; onFocus: (focus: Focus) => void; lang: Lang }) {
  return (
    <button type="button" className={`hdr-team hdr-team-${align}`} onClick={() => onFocus({ kind: 'club', id: side.id })} aria-label={`${displayClubName(side.name, lang)} ${tr(lang, 'club information', '구단 정보')}`}>
      <span className="hdr-name">{displayClubName(side.name, lang)}</span>
      <CrestImage id={side.id} short={side.short} color={side.colors[0]} size={44} />
    </button>
  );
}

function MatchHeader({ match, replay, tab, onTab, onFocus, mode, prefs, onPrefs }: { match: DemoMatch; replay: Replay; tab: Tab; onTab: (t: Tab) => void; onFocus: (f: Focus) => void; mode: Mode; prefs: Prefs; onPrefs: (p: Prefs) => void }) {
  const follow = useFollow();
  const snap = replay.snapshot;
  const isLive = snap !== null && snap.phase !== 'pre';
  const tabs = mode === 'fan' ? FAN_TABS : BROADCAST_TABS;
  return (
    <header className="match-header">
      <div className="hdr-top">
        <span className="hdr-brand">Standfolk</span>
        <span className="hdr-comp">{prefs.lang === 'ko' ? `브렌무어 리그 · ${match.matchday}라운드` : `Brenmoor League · Matchday ${match.matchday}`}</span>
        <div className="hdr-actions">
          <span className="hdr-settings"><Settings mode={mode} prefs={prefs} onPrefs={onPrefs} /></span>
          <button type="button" className={`follow${follow.isFollowing ? ' follow-on' : ''}`} aria-pressed={follow.isFollowing} aria-label={tr(prefs.lang, 'Follow this match', '경기 팔로우')} onClick={follow.toggle}>
            <Star size={16} aria-hidden="true" /><span>{follow.isFollowing ? tr(prefs.lang, 'Following', '팔로우 중') : tr(prefs.lang, 'Follow', '팔로우')}</span>
          </button>
        </div>
      </div>
      <div className="hdr-meta">
        <span><CalendarDays size={15} aria-hidden="true" />{kickoffText(match.kickoff, prefs.lang)}</span>
        <span><MapPin size={15} aria-hidden="true" />{displayGroundName(match.home.ground, prefs.lang)}</span>
        <span className="synthetic">{tr(prefs.lang, 'Synthetic match demo', '가상 경기 데모')}</span>
      </div>
      <div className="hdr-score">
        <TeamName side={match.home} align="home" onFocus={onFocus} lang={prefs.lang} />
        <div className="hdr-centre" aria-live="polite">
          <span className="hdr-vs">{isLive ? `${snap.score[match.home.id]} – ${snap.score[match.away.id]}` : timeText(match.kickoff, prefs.lang)}</span>
          <span className="hdr-status">{statusText(snap, prefs.lang)}</span>
        </div>
        <TeamName side={match.away} align="away" onFocus={onFocus} lang={prefs.lang} />
      </div>
      {isLive && (
        <div className="hdr-scorers">
          {[match.home.id, match.away.id].map((id) => <span key={id}>{scorers(match, snap, id, prefs.lang).map((g) => <span key={g}>{g}</span>)}</span>)}
        </div>
      )}
      <nav className="hdr-tabs" role="tablist" aria-label={mode === 'fan' ? tr(prefs.lang, 'Fan matchday navigation', '팬 화면 메뉴') : tr(prefs.lang, 'Broadcast production navigation', '방송 제작 메뉴')}>
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => onTab(id)}>{prefs.lang === 'ko' ? ({ match: '경기 보기', discover: '둘러보기', stories: '스토리', players: '선수', table: '순위', studio: '스튜디오', h2h: '전적' } as Record<Tab, string>)[id] ?? label : label}</button>)}
      </nav>
    </header>
  );
}

function FormRow({ side, results, lang }: { side: MatchSide; results: DemoMatch['head_to_head']['matches']; lang: Lang }) {
  return (
    <div className="form-row">
      <CrestImage id={side.id} short={side.short} color={side.colors[0]} size={22} />
      <span className="form-team">{side.short}</span>
      <ol className="form">{results.map((r) => <li key={`${r.season}-${r.matchday}`} className={`form-${r.outcome}`}>{lang === 'ko' ? ({ W: '승', D: '무', L: '패' } as Record<string, string>)[r.outcome] : r.outcome}</li>)}</ol>
    </div>
  );
}

function InfoCards({ match, forms, atMs, lang }: { match: DemoMatch; forms: Record<string, DemoMatch['head_to_head']['matches']>; atMs: number; lang: Lang }) {
  const h = match.head_to_head;
  const venue = match.home;
  return (
    <aside className="side-cards" aria-label={tr(lang, 'Match information', '경기 정보')}>
      <section className="info-card">
        <h2>{tr(lang, 'Ask', '질문')}</h2>
        <AskBox subject={null} atMs={atMs} lang={lang} />
      </section>
      <section className="info-card">
        <h2>{displayGroundName(venue.ground, lang)}</h2>
        <p className="muted">{displayTownName(venue.town, lang)}</p>
        <ul className="info-rows">
          <li><Users size={18} aria-hidden="true" /><span>{tr(lang, 'Capacity', '수용 인원')}</span><strong>{venue.capacity.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-GB')}</strong></li>
          {venue.surface && <li><Layers size={18} aria-hidden="true" /><span>{tr(lang, 'Surface', '경기장 표면')}</span><strong>{displaySurfaceName(venue.surface, lang)}</strong></li>}
          <li><Gauge size={18} aria-hidden="true" /><span>{tr(lang, 'Table', '순위')}</span><strong>{lang === 'ko' ? `${venue.standing ? `${venue.standing.position}위` : '–'} 대 ${match.away.standing ? `${match.away.standing.position}위` : '–'}` : `${venue.standing ? ordinal(venue.standing.position) : '–'} v ${match.away.standing ? ordinal(match.away.standing.position) : '–'}`}</strong></li>
        </ul>
      </section>
      <section className="info-card">
        <h2>{tr(lang, 'Form', '최근 흐름')}</h2>
        {forms[match.home.id] && <FormRow side={match.home} results={forms[match.home.id]} lang={lang} />}
        {forms[match.away.id] && <FormRow side={match.away} results={forms[match.away.id]} lang={lang} />}
      </section>
      <section className="info-card">
        <h2>{tr(lang, 'Head-to-head', '상대 전적')}</h2>
        <div className="h2h-bar">
          <div style={{ flex: h.wins, background: match.home.colors[0] }}><strong>{h.wins}</strong>{match.home.short}</div>
          <div style={{ flex: h.draws, background: '#9c958c' }}><strong>{h.draws}</strong>{tr(lang, 'Draws', '무승부')}</div>
          <div style={{ flex: h.losses, background: match.away.colors[0] }}><strong>{h.losses}</strong>{match.away.short}</div>
        </div>
        <p className="muted">{tr(lang, 'League meetings since', '리그 맞대결 기록 · 시작 시즌')} {h.matches[0]?.season}</p>
      </section>
    </aside>
  );
}

function Summary({ match, forms, replay, onShow, onFocus, prefs }: { match: DemoMatch; forms: Record<string, DemoMatch['head_to_head']['matches']>; replay: Replay; onShow: (s: Sub) => void; onFocus: (f: Focus) => void; prefs: Prefs }) {
  const hot = [match.home, match.away].flatMap((side) => match.insights[side.id].streaks.filter((s) => s.value >= 2).map((s) => ({ side, s })));
  const story = [match.home, match.away].map((side) => ({ side, story: match.insights[side.id].stories[0] })).filter((x) => x.story);
  return (
    <div className="summary">
      <KeyMoments match={match} snapshot={replay.snapshot} onFocus={onFocus} depth={prefs.depth} lang={prefs.lang} />
      <section className="card">
        <h2>{tr(prefs.lang, 'Form going in', '경기 전 최근 흐름')}</h2>
        {forms[match.home.id] && <FormRow side={match.home} results={forms[match.home.id]} lang={prefs.lang} />}
        {forms[match.away.id] && <FormRow side={match.away} results={forms[match.away.id]} lang={prefs.lang} />}
      </section>
      <section className="card">
        <h2>{tr(prefs.lang, 'Streaks to watch', '주목할 연속 기록')}</h2>
        <ul className="streaks">{hot.slice(0, 4).map(({ side, s }) => <li key={side.id + s.id} className="hot"><span>{side.short} · {s.label}</span><strong>{s.value}</strong><span className="muted">{s.unit}</span></li>)}</ul>
        <button type="button" className="link" onClick={() => onShow('streaks')}>{tr(prefs.lang, 'All streaks', '전체 기록 보기')}</button>
      </section>
      <section className="card summary-wide">
        <h2>{tr(prefs.lang, 'Stories', '스토리')}</h2>
        <div className="two-up">{story.map(({ side, story: s }) => <article key={side.id} className="story" style={{ ['--club' as string]: side.colors[0] }}><h3>{s.title}</h3><p>{s.text}</p></article>)}</div>
        <button type="button" className="link" onClick={() => onShow('stories')}>{tr(prefs.lang, 'More stories', '스토리 더 보기')}</button>
      </section>
    </div>
  );
}

const GLOSSARY_KO: Record<string, [string, string]> = {
  'Clean sheet': ['무실점 경기', '한 경기에서 실점하지 않은 경우입니다.'],
  Brace: ['멀티골', '한 선수가 한 경기에서 두 골을 넣은 기록입니다.'],
  'Hat-trick': ['해트트릭', '한 선수가 한 경기에서 세 골을 넣은 기록입니다.'],
  'Six-pointer': ['승점 6점짜리 경기', '순위가 가까운 라이벌의 맞대결로, 결과에 따라 두 팀 사이의 승점 차가 크게 달라질 수 있습니다.'],
  'Relegation zone': ['강등권', '하위 세 구단은 브렌무어 챔피언십으로 강등됩니다.'],
  'Academy graduate': ['유스 출신 선수', '구단의 자체 유소년 시스템을 거쳐 성장한 선수입니다.'],
  'Off the bench': ['교체 투입', '교체 선수로 경기에 들어왔다는 뜻입니다.'],
  'Loan spell': ['임대 기간', '원 소속 구단으로 돌아오기 전 다른 구단에서 뛰는 기간입니다.']
};

function TableTab({ highlight, lang }: { highlight: string[]; lang: Lang }) {
  const [table, setTable] = useState<LeagueTable | null>(null);
  useEffect(() => {
    let isCurrent = true;
    getJson<LeagueTable>('/api/league/table').then((t) => { if (isCurrent) setTable(t); }).catch(() => { if (isCurrent) setTable(null); });
    return () => { isCurrent = false; };
  }, []);
  // The card frame holds the table's space while it loads, so the page does not jump.
  if (!table) return <section className="card loading-card" aria-busy="true"><p className="muted">{tr(lang, 'Loading the table…', '리그 순위를 불러오는 중…')}</p></section>;
  const { basics: b } = table;
  const relegationFrom = b.clubs - b.relegated + 1;
  return (
    <>
    <section className="card">
      <h2>{tr(lang, 'Brenmoor League', '브렌무어 리그')} {table.season} · {lang === 'ko' ? `${table.matchdays_played}라운드 종료 후` : `after ${table.matchdays_played} matchdays`}</h2>
      <table className="league">
        <thead><tr><th scope="col">#</th><th scope="col">{tr(lang, 'Club', '구단')}</th><th scope="col" className="num">{tr(lang, 'P', '경기')}</th><th scope="col" className="num">{tr(lang, 'W', '승')}</th><th scope="col" className="num">{tr(lang, 'D', '무')}</th><th scope="col" className="num">{tr(lang, 'L', '패')}</th><th scope="col" className="num">{tr(lang, 'GD', '득실')}</th><th scope="col" className="num">{tr(lang, 'Pts', '승점')}</th></tr></thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.club} className={highlight.includes(r.club) ? 'row-hl' : r.position >= relegationFrom ? 'row-drop' : ''}>
              <td>{r.position}</td>
              <td><span className="club-cell"><CrestImage id={r.club} short={r.short} color={r.colors[0]} size={20} />{displayClubName(r.name, lang)}</span></td>
              <td className="num">{r.played}</td><td className="num">{r.won}</td><td className="num">{r.drawn}</td><td className="num">{r.lost}</td><td className="num">{r.gd > 0 ? `+${r.gd}` : r.gd}</td><td className="num"><strong>{r.points}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">{tr(lang, 'Fictional league · World data as of', '가상 리그 · 세계관 데이터 기준일')} {new Date(`${table.data_date}T12:00:00Z`).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </section>
    <section className="card">
      <h2>{lang === 'ko' ? `${displayLeagueName(b.name, lang)} 운영 방식` : `How the ${b.name} works`}</h2>
      <ul className="basics">
        <li>{lang === 'ko' ? `${b.clubs}개 구단이 홈·원정으로 맞붙으며, 8월부터 5월까지 ${b.matchdays}라운드를 치릅니다.` : `${b.clubs} clubs play each other home and away: ${b.matchdays} matchdays from August to May.`}</li>
        <li>{lang === 'ko' ? `승리 ${b.points.win}점, 무승부 ${b.points.draw}점, 패배 ${b.points.loss}점입니다. 승점이 가장 높은 구단이 우승합니다.` : `A win earns ${b.points.win} points, a draw ${b.points.draw}, a defeat ${b.points.loss}. Most points wins the title.`}</li>
        <li>{lang === 'ko' ? `하위 ${b.relegated}개 구단(표에서 ${relegationFrom}위부터 빨간색)은 ${displayLeagueName(b.second_tier, lang)}로 강등됩니다.` : `The bottom ${b.relegated} (from ${relegationFrom}th place down, marked red in the table) go down to the ${b.second_tier}.`}</li>
        <li>{lang === 'ko' ? `${b.founded}년부터 운영된 가상 리그입니다. 모든 구단·선수·기록은 창작 자료입니다.` : `The league has run since ${b.founded}. Every club, player, and record in it is fictional.`}</li>
      </ul>
    </section>
    <section className="card">
      <h2>{tr(lang, 'Words you will hear', '축구 용어')}</h2>
      <dl className="glossary">
        {table.glossary.map((g) => {
          const translated = GLOSSARY_KO[g.term];
          return <div key={g.term}><dt>{lang === 'ko' ? translated?.[0] ?? g.term : g.term}</dt><dd>{lang === 'ko' ? translated?.[1] ?? g.meaning : g.meaning}</dd></div>;
        })}
      </dl>
    </section>
    </>
  );
}

function HeadToHeadTab({ match, lang }: { match: DemoMatch; lang: Lang }) {
  const short = (id: string) => (id === match.home.id ? match.home.short : match.away.short);
  return (
    <section className="card">
      <h2>{tr(lang, 'All league meetings', '리그 맞대결 전체 기록')}</h2>
      <ol className="meetings">
        {[...match.head_to_head.matches].reverse().map((m) => (
          <li key={`${m.season}-${m.matchday}`}><span className="muted">{m.season} · {tr(lang, 'Matchday', '라운드')} {m.matchday}</span><span className="meeting-score">{short(m.home)} {m.score.replace('-', ' – ')} {short(m.away)}</span><span className={`pill form-${m.outcome}`}>{lang === 'ko' ? ({ W: '승', D: '무', L: '패' } as Record<string, string>)[m.outcome] : m.outcome}</span></li>
        ))}
      </ol>
    </section>
  );
}

export function App() {
  const [match, setMatch] = useState<DemoMatch | null>(null);
  const [forms, setForms] = useState<Record<string, DemoMatch['head_to_head']['matches']>>({});
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [showWorkspaceChooser, setShowWorkspaceChooser] = useState(() => !hasModeInUrl());
  const mode = prefs.mode;
  const [tab, setTab] = useState<Tab>(() => mode === 'broadcast' ? 'studio' : 'match');
  const [sub, setSub] = useState<Sub>(() => mode === 'broadcast' ? 'lineups' : 'summary');
  const replay = useReplay(prefs.lang);

  useEffect(() => { document.documentElement.lang = prefs.lang; }, [prefs.lang]);

  useEffect(() => {
    let isCurrent = true;
    getJson<DemoMatch>(`/api/match/demo?lang=${prefs.lang}`)
      .then(async (m) => {
        const clubs = await Promise.all([m.home.id, m.away.id].map((id) => getJson<{ summary: { last_five: DemoMatch['head_to_head']['matches'] } | null }>(`/api/clubs/${id}`)));
        if (!isCurrent) return;
        setMatch(m);
        setForms({ [m.home.id]: clubs[0].summary?.last_five ?? [], [m.away.id]: clubs[1].summary?.last_five ?? [] });
      })
      .catch((err: unknown) => { if (isCurrent) setError(err instanceof Error ? err.message : 'Could not load the match.'); });
    return () => { isCurrent = false; };
  }, [prefs.lang]);

  const handlePrefs = (next: Prefs) => { setPrefs(next); savePrefs(next); };
  const handleMode = (next: Mode) => {
    setTab(next === 'broadcast' ? 'studio' : 'match');
    setSub(next === 'fan' ? 'summary' : 'lineups');
    setFocus(null);
    setIsExpanded(false);
  };
  const enterWorkspace = (next: Mode) => {
    handleMode(next);
    handlePrefs({ ...prefs, mode: next });
    setShowWorkspaceChooser(false);
  };

  if (showWorkspaceChooser) return <WorkspaceChooser onSelect={enterWorkspace} lang={prefs.lang} />;
  if (error) return <main className="state" role="alert">{tr(prefs.lang, 'The match could not be loaded', '경기를 불러오지 못했습니다')}: {error}</main>;
  if (!match) return <main className="state">{tr(prefs.lang, 'Loading the match…', '경기 데이터를 불러오는 중…')}</main>;
  const matchSubnav = mode === 'fan' ? FAN_MATCH_SUBS : BROADCAST_MATCH_SUBS;

  return (
    <div className="page" data-mode={mode} data-lang={prefs.lang} data-depth={prefs.depth}>
      <MatchHeader match={match} replay={replay} tab={tab} onTab={setTab} onFocus={setFocus} mode={mode} prefs={prefs} onPrefs={handlePrefs} />
      <ReplayBar replay={replay} lang={prefs.lang} />
      <AudienceContext
        mode={mode}
        lang={prefs.lang}
        isHome={mode === 'fan' ? tab === 'match' : tab === 'studio'}
        onOpenHome={() => {
          setTab(mode === 'fan' ? 'match' : 'studio');
          setSub(mode === 'fan' ? 'summary' : 'lineups');
          setFocus(null);
          setIsExpanded(false);
        }}
      />
      {/* Discover and Studio have their own full-width workflows. */}
      <div className={`body${isExpanded ? ' body-expanded' : ''}${(tab === 'studio' || tab === 'discover') && !focus ? ' body-solo' : ''}`}>
        <main className="main" role="tabpanel">
          {tab === 'match' && (
            <>
              {replay.snapshot?.on_air && (
                <section className="on-air" aria-live="polite" aria-label={tr(prefs.lang, 'On air', '송출 중')}>
                  <div className="lower-third">
                    <p className="lower-third-short">{replay.snapshot.on_air.short}</p>
                    <p className="lower-third-long">{replay.snapshot.on_air.long}</p>
                  </div>
                </section>
              )}
              <nav className="pills" aria-label={mode === 'fan' ? tr(prefs.lang, 'Watch views', '경기 보기 메뉴') : tr(prefs.lang, 'Match monitor views', '경기 모니터 메뉴')}>
                {matchSubnav.map(([id, label]) => <button key={id} type="button" aria-pressed={sub === id} onClick={() => setSub(id)}>{prefs.lang === 'ko' ? ({ summary: '요약', lineups: '선수 명단', stats: '기록', streaks: '연속 기록', players: '선수 기록', stories: '스토리' } as Record<Sub, string>)[id] : label}</button>)}
              </nav>
              {sub === 'summary' && <Summary match={match} forms={forms} replay={replay} onShow={(next) => {
                if (mode === 'fan' && next === 'stories') setTab('stories');
                else setSub(next);
              }} onFocus={setFocus} prefs={prefs} />}
              {sub === 'lineups' && <Lineups key={mode} home={match.home} away={match.away} mode={mode} focusId={focus?.id ?? null} onFocus={setFocus} lang={prefs.lang} />}
              {sub === 'stats' && <StatsTab match={match} onFocus={setFocus} lang={prefs.lang} />}
              {sub === 'players' && <PlayerStatsTab match={match} onFocus={setFocus} lang={prefs.lang} />}
              {sub === 'streaks' && <StreaksTab match={match} onFocus={setFocus} lang={prefs.lang} />}
            </>
          )}
          {tab === 'discover' && mode === 'fan' && <Discover match={match} snapshot={replay.snapshot} atMs={replay.atMs} lang={prefs.lang} onWatch={() => { setTab('match'); setSub('summary'); }} onFocus={setFocus} />}
          {tab === 'stories' && mode === 'fan' && <StoriesTab match={match} onFocus={setFocus} lang={prefs.lang} />}
          {tab === 'players' && mode === 'fan' && <PlayerStatsTab match={match} onFocus={setFocus} lang={prefs.lang} />}
          {tab === 'table' && <TableTab highlight={[match.home.id, match.away.id]} lang={prefs.lang} />}
          {tab === 'h2h' && <HeadToHeadTab match={match} lang={prefs.lang} />}
          {tab === 'studio' && mode === 'broadcast' && <Studio atMs={replay.atMs} events={replay.snapshot?.events ?? []} lang={prefs.lang} depth={prefs.depth} />}
        </main>
        {focus
          ? <SidePanel focus={focus} mode={mode} atMs={replay.atMs} isExpanded={isExpanded} onExpand={setIsExpanded} onClose={() => { setFocus(null); setIsExpanded(false); }} lang={prefs.lang} />
          : tab !== 'studio' && tab !== 'discover' && <InfoCards match={match} forms={forms} atMs={replay.atMs} lang={prefs.lang} />}
      </div>
      <div className="dock"><Settings mode={mode} prefs={prefs} onPrefs={handlePrefs} /></div>
    </div>
  );
}
