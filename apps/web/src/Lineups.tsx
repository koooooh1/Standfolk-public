import { useState } from 'react';
import type { Brief, Lang, MatchSide, Mode } from './api';
import type { Focus } from './SidePanel';
import { CrestImage, Portrait } from './Portrait';
import { displayClubName, displayPlayerName, tr } from './i18n';

// One team at a time on a vertical pitch drawn in perspective; slots are 4-3-3 attacking upwards, as % of width and height.
const SLOTS: Array<[number, number]> = [
  [50, 88],
  [14, 68], [38, 72], [62, 72], [86, 68],
  [24, 47], [50, 51], [76, 47],
  [20, 22], [50, 17], [80, 22]
];
// Narrow the far end of the pitch so positions follow the drawn perspective.
const project = ([x, y]: [number, number]): [number, number] => [50 + (x - 50) * (0.78 + 0.22 * (y / 100)), y];

const NATION_CODE: Record<string, string> = {
  England: 'ENG', Scotland: 'SCO', Wales: 'WAL', 'Northern Ireland': 'NIR', Ireland: 'IRL', Czechia: 'CZE', Slovakia: 'SVK', Israel: 'ISR',
  France: 'FRA', Morocco: 'MAR', Japan: 'JPN', Uruguay: 'URU', Ghana: 'GHA', Netherlands: 'NED', Spain: 'ESP', Denmark: 'DEN', Argentina: 'ARG',
  Nigeria: 'NGA', Hungary: 'HUN', Belgium: 'BEL', Norway: 'NOR', Sweden: 'SWE', Portugal: 'POR', Croatia: 'CRO', Poland: 'POL', Finland: 'FIN', 'Korea Republic': 'KOR'
};
export const nationCode = (nationality: string) => NATION_CODE[nationality] ?? nationality.slice(0, 3).toUpperCase();

export type Lens = 'goals' | 'shots' | 'fouls' | 'value' | 'height' | 'age' | 'nation' | 'say';
const LENSES: Array<[Lens, string, string]> = [['goals', 'Goals', '득점'], ['shots', 'Shots', '슈팅'], ['fouls', 'Fouls', '파울'], ['value', 'Value', '시장 가치'], ['height', 'Height', '키'], ['age', 'Age', '나이'], ['nation', 'Nation', '국적'], ['say', 'Say it', '발음 안내']];

export const euros = (m: number) => `€${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}m`;

function lensText(p: Brief, lens: Lens, lang: Lang): string | null {
  switch (lens) {
    case 'goals': return `${p.season_goals} G`;
    case 'shots': return lang === 'ko' ? `슈팅 ${p.season_shots}` : `${p.season_shots} shots`;
    case 'fouls': return lang === 'ko' ? `파울 ${p.season_fouls}` : `${p.season_fouls} fouls`;
    case 'value': return euros(p.value_eur_m);
    case 'height': return lang === 'ko' ? `${p.height_cm}cm` : `${p.height_cm} cm`;
    case 'age': return lang === 'ko' ? `${p.age}세` : `${p.age} yrs`;
    case 'nation': return lang === 'ko' ? (NATIONALITY_KO[p.nationality] ?? p.nationality) : p.nationality;
    case 'say': return p.pronunciation;
  }
}

type TokenProps = { player: Brief; color: string; slot: [number, number]; lens: Lens; isFocused: boolean; onFocus: (focus: Focus) => void };

function Token({ player, color, slot, lens, isFocused, onFocus, lang }: TokenProps & { lang: Lang }) {
  const [x, y] = project(slot);
  const info = lensText(player, lens, lang);
  const name = displayPlayerName(player.name, player.native_name, lang);
  return (
    <button type="button" className={`face${isFocused ? ' face-focused' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}
      onClick={() => onFocus({ kind: 'player', id: player.id })} aria-label={lang === 'ko' ? `${name}, 등번호 ${player.number}` : `${name}, number ${player.number}`}>
      <span className="face-photo">
        <Portrait id={player.id} number={player.number} color={color} size={62} name="" />
        <span className="face-number">{player.number}</span>
        <span className="face-nation">{nationCode(player.nationality)}</span>
        {player.captain && <span className="face-captain" aria-label={tr(lang, 'Captain', '주장')}>C</span>}
      </span>
      <span className="face-name">{name.split(' ').slice(-1)[0]}</span>
      {info && <span className="face-info">{info}</span>}
    </button>
  );
}

type Props = { home: MatchSide; away: MatchSide; mode: Mode; focusId: string | null; onFocus: (focus: Focus) => void; lang?: Lang };

const NATIONALITY_KO: Record<string, string> = { England: '잉글랜드', Scotland: '스코틀랜드', Wales: '웨일스', Ireland: '아일랜드', France: '프랑스', Japan: '일본', Sweden: '스웨덴', Norway: '노르웨이', Denmark: '덴마크', Spain: '스페인', Portugal: '포르투갈', Ghana: '가나', Nigeria: '나이지리아', Morocco: '모로코', Argentina: '아르헨티나', Uruguay: '우루과이', 'Korea Republic': '대한민국' };

export function Lineups({ home, away, mode, focusId, onFocus, lang = 'en' }: Props) {
  const [teamId, setTeamId] = useState(home.id);
  const [lens, setLens] = useState<Lens>(mode === 'broadcast' ? 'say' : 'goals');
  const team = teamId === home.id ? home : away;
  return (
    <section className="lineups" aria-label={tr(lang, 'Line-ups', '선수 명단')}>
      <div className="team-switch" role="group" aria-label={tr(lang, 'Team', '팀')}>
        {[home, away].map((side) => (
          <button key={side.id} type="button" aria-pressed={teamId === side.id} onClick={() => setTeamId(side.id)} style={{ ['--club' as string]: side.colors[0] }}>
            <CrestImage id={side.id} short={side.short} color={side.colors[0]} size={22} />{displayClubName(side.name, lang)}<span className="muted">{side.lineup.formation}</span>
          </button>
        ))}
      </div>
      <div className="lens-row" role="group" aria-label={tr(lang, 'Show under each player', '선수별 표시 정보')}>
        {LENSES.map(([id, label, labelKo]) => <button key={id} type="button" aria-pressed={lens === id} onClick={() => setLens(id)}>{lang === 'ko' ? labelKo : label}</button>)}
      </div>
      <div className="stage3d">
        <div className="turf" aria-hidden="true">
          <svg viewBox="0 0 68 105" preserveAspectRatio="none"><rect x="1" y="1" width="66" height="103" /><line x1="1" y1="52.5" x2="67" y2="52.5" /><circle cx="34" cy="52.5" r="9" /><rect x="13.85" y="1" width="40.3" height="16.5" /><rect x="13.85" y="88" width="40.3" height="16.5" /></svg>
        </div>
        <div className="faces" role="group" aria-label={`${displayClubName(team.name, lang)} ${tr(lang, 'starting line-up', '선발 명단')}`}>
          {team.lineup.starters.map((p, i) => <Token key={p.id} player={p} color={team.colors[0]} slot={SLOTS[i] ?? [50, 50]} lens={lens} isFocused={focusId === p.id} onFocus={onFocus} lang={lang} />)}
        </div>
      </div>
      <h3 className="bench-title">{tr(lang, 'Substitutes', '교체 선수')}</h3>
      <ul className="bench-grid">
        {team.lineup.bench.map((p) => (
          <li key={p.id}>
            <button type="button" className={`bench-card${focusId === p.id ? ' face-focused' : ''}`} onClick={() => onFocus({ kind: 'player', id: p.id })}>
              <Portrait id={p.id} number={p.number} color={team.colors[0]} size={44} name="" />
              <span><strong>{p.number} {displayPlayerName(p.name, p.native_name, lang)}</strong><span className="muted">{p.pos} · {lensText(p, lens, lang) ?? (lang === 'ko' ? (NATIONALITY_KO[p.nationality] ?? p.nationality) : nationCode(p.nationality))}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
