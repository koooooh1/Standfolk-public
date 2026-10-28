import { useState } from 'react';
import type { Comparison, DemoMatch, Lang, LeaderCategory, MatchSide } from './api';
import { euros, nationCode } from './Lineups';
import { CrestImage, Portrait } from './Portrait';
import type { Focus } from './SidePanel';
import { displayClubName, displayPlayerName, tr } from './i18n';

type TabProps = { match: DemoMatch; onFocus: (focus: Focus) => void; lang?: Lang };

const METRICS: Array<[keyof Comparison, string, (v: number) => string, 'high' | 'low']> = [
  ['points', 'Points', String, 'high'],
  ['goals_for', 'Goals scored', String, 'high'],
  ['goals_against', 'Goals conceded', String, 'low'],
  ['clean_sheets', 'Clean sheets', String, 'high'],
  ['average_age', 'Average squad age', (v) => v.toFixed(1), 'low'],
  ['squad_value_eur_m', 'Squad value (fictional)', euros, 'high']
];

// Mirrored bars: each side's share of the pair, the better side in its club colour.
export function StatsTab({ match, lang = 'en' }: TabProps) {
  const a = match.insights[match.home.id].comparison;
  const b = match.insights[match.away.id].comparison;
  return (
    <section className="card">
      <div className="vs-head"><Side side={match.home} lang={lang} /><span className="muted">{lang === 'ko' ? `이번 시즌 · 양 팀 모두 ${a.played}경기` : `This season · ${a.played} matches each`}</span><Side side={match.away} end lang={lang} /></div>
      <ul className="duel">
        {METRICS.map(([key, label, fmt, better]) => {
          const x = a[key];
          const y = b[key];
          const total = x + y || 1;
          const homeBetter = better === 'high' ? x >= y : x <= y;
          return (
            <li key={key}>
              <div className="duel-row"><strong>{fmt(x)}</strong><span>{lang === 'ko' ? ({ points: '승점', goals_for: '득점', goals_against: '실점', clean_sheets: '무실점 경기', average_age: '평균 선수단 나이', squad_value_eur_m: '선수단 가치 (가상)' } as Record<keyof Comparison, string>)[key] : label}</span><strong>{fmt(y)}</strong></div>
              <div className="duel-bar">
                <span style={{ width: `${(x / total) * 100}%`, background: homeBetter ? match.home.colors[0] : '#d9d2c7' }} />
                <span style={{ width: `${(y / total) * 100}%`, background: homeBetter ? '#d9d2c7' : match.away.colors[0] }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Side({ side, end, lang }: { side: MatchSide; end?: boolean; lang: Lang }) {
  return <span className={`vs-side${end ? ' vs-side-end' : ''}`}><CrestImage id={side.id} short={side.short} color={side.colors[0]} size={26} />{displayClubName(side.name, lang)}</span>;
}

function storySource(src: string, lang: Lang) {
  if (lang === 'en') return src;
  if (src === 'league-seasons') return '리그 시즌 기록';
  if (src.startsWith('people:')) return '선수 기록';
  if (src.startsWith('club-')) return '구단 역사 및 문화 자료';
  return src;
}

const CATEGORIES: Array<[LeaderCategory, string, string, (v: number) => string]> = [
  ['goals', 'Goals', '득점', String], ['assists', 'Assists', '도움', String], ['shots', 'Shots', '슈팅', String], ['fouls', 'Fouls', '파울', String], ['value', 'Value', '가치', euros], ['height', 'Height', '키', (v) => `${v} cm`]
];

// Leaderboard across both squads: a podium for the top three, then the rest as a list.
export function PlayerStatsTab({ match, onFocus, lang = 'en' }: TabProps) {
  const [category, setCategory] = useState<LeaderCategory>('goals');
  const fmt = CATEGORIES.find(([id]) => id === category)![3];
  const rows = match.leaders[category];
  const colorOf = (id: string) => (match.home.lineup.starters.concat(match.home.lineup.bench).some((p) => p.id === id) ? match.home : match.away);
  return (
    <section className="card">
      <div className="segmented" role="group" aria-label={tr(lang, 'Category', '기록 항목')}>
        {CATEGORIES.map(([id, label, labelKo]) => <button key={id} type="button" aria-pressed={category === id} onClick={() => setCategory(id)}>{lang === 'ko' ? labelKo : label}</button>)}
      </div>
      <ol className="podium">
        {rows.slice(0, 3).map((p, i) => {
          const club = colorOf(p.id);
          return (
            <li key={p.id} className={`podium-${i + 1}`}>
              <button type="button" onClick={() => onFocus({ kind: 'player', id: p.id })}>
                <Portrait id={p.id} number={p.number} color={club.colors[0]} size={i === 0 ? 92 : 76} name="" />
                <span className="podium-value">{fmt(p.value)}</span>
                <strong>{displayPlayerName(p.name, p.native_name, lang)}</strong>
                <span className="muted">{club.short} · {p.pos} · {nationCode(p.nationality)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <ol className="ranking" start={4}>
        {rows.slice(3).map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onFocus({ kind: 'player', id: p.id })}>
              <Portrait id={p.id} number={p.number} color={colorOf(p.id).colors[0]} size={36} name="" />
              <span><strong>{displayPlayerName(p.name, p.native_name, lang)}</strong> <span className="muted">{colorOf(p.id).short} · {p.pos}</span></span>
              <strong>{fmt(p.value)}</strong>
            </button>
          </li>
        ))}
      </ol>
      <p className="source">{tr(lang, 'Current league season for both squads. Values are fictional estimates.', '양 팀의 현재 리그 시즌 기록입니다. 선수 가치는 가상 추정치입니다.')}</p>
    </section>
  );
}

export function StreaksTab({ match, lang = 'en' }: TabProps) {
  return (
    <div className="two-up">
      {[match.home, match.away].map((side) => (
        <section key={side.id} className="card">
          <h2 className="with-crest"><CrestImage id={side.id} short={side.short} color={side.colors[0]} size={24} />{displayClubName(side.name, lang)}</h2>
          <ul className="streaks">
            {match.insights[side.id].streaks.map((s) => (
              <li key={s.id} className={s.value >= 3 ? 'hot' : ''}><span>{s.label}</span><strong>{s.value}</strong><span className="muted">{lang === 'ko' ? ({ matches: '경기', goals: '골', games: '경기' } as Record<string, string>)[s.unit] ?? s.unit : s.unit}</span></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function StoriesTab({ match, lang = 'en' }: TabProps) {
  return (
    <div className="two-up">
      {[match.home, match.away].map((side) => (
        <section key={side.id} className="card">
          <h2 className="with-crest"><CrestImage id={side.id} short={side.short} color={side.colors[0]} size={24} />{displayClubName(side.name, lang)}</h2>
          {match.insights[side.id].stories.map((s) => (
            <article key={s.title} className="story" style={{ ['--club' as string]: side.colors[0] }}>
              <h3>{s.title}</h3><p>{s.text}</p><span className="source">{tr(lang, 'Source', '출처')}: {storySource(s.src, lang)}</span>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
