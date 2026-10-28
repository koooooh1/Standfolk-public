import type { Lang, Mode, PlayerDetail } from './api';
import { Pronounce } from './Pronounce';
import { displayClubName, displayCountryName, displayPlayerName, playerNarrative, tr } from './i18n';

type Props = { player: PlayerDetail; view: Mode; isExpanded: boolean; lang: Lang };

function NationalTeamLine({ player, lang }: { player: PlayerDetail; lang: Lang }) {
  const nt = player.national_team;
  if (!nt) return <p>{tr(lang, 'Not capped at international level.', '성인·연령별 대표팀 출전 기록이 없습니다.')}</p>;
  if (lang === 'ko') {
    const level = nt.level === 'senior' ? '성인 대표팀' : `${nt.level.replace('under-', 'U-')} 대표팀`;
    const status = nt.status === 'current' ? '현역' : nt.status === 'former' ? '이전 기록' : nt.status;
    return <p>{displayCountryName(nt.team, lang)} {level}: {nt.debut}년부터 {nt.caps}경기 {nt.goals}골 ({status}).</p>;
  }
  const level = nt.level === 'senior' ? '' : ` ${nt.level}`;
  return <p>{nt.team}{level}: {nt.caps} caps, {nt.goals} goals since {nt.debut} ({nt.status}).</p>;
}

function Journey({ player, lang }: { player: PlayerDetail; lang: Lang }) {
  const start = player.from === 'academy'
    ? (lang === 'ko' ? `${player.academy_since}년부터 구단 유소년 아카데미에서 성장했습니다.` : `Came through the club academy (from ${player.academy_since}).`)
    : (lang === 'ko' ? `${player.joined}년에 ${player.from_name ? displayClubName(player.from_name, lang) : '해외 구단'}에서 합류했습니다.` : `Joined in ${player.joined}${player.from_name ? ` from ${player.from_name}` : ' from abroad'}.`);
  return (
    <ol className="journey">
      {player.home_career?.map((h) => <li key={h.where + h.years}><strong>{h.years}</strong> {playerNarrative(player.id, h.where, lang)} · {lang === 'ko' ? `${h.apps}경기, ${h.goals}골` : `${h.apps} apps, ${h.goals} goals`}</li>)}
      <li><strong>{player.joined}</strong> {start}</li>
      {player.loans.map((l) => <li key={l.season + l.club_name}><strong>{l.season}</strong> {lang === 'ko' ? `${l.club_name ? displayClubName(l.club_name, lang) : '다른 구단'}으로 임대` : `On loan at ${l.club_name ?? 'another club'}`}</li>)}
    </ol>
  );
}

function SeasonTable({ player, lang }: { player: PlayerDetail; lang: Lang }) {
  return (
    <table className="stats">
      <thead><tr><th scope="col">{tr(lang, 'Season', '시즌')}</th><th scope="col" className="num">{tr(lang, 'Apps', '경기')}</th><th scope="col" className="num">{tr(lang, 'Goals', '골')}</th><th scope="col" className="num">{tr(lang, 'Assists', '도움')}</th></tr></thead>
      <tbody>
        {player.seasons.map((s) => (
          <tr key={s.season}><td>{s.season}</td><td className="num">{s.appearances}</td><td className="num">{s.goals}</td><td className="num">{s.assists}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Figures({ items }: { items: Array<[string, string | number]> }) {
  return (
    <dl className="figures">
      {items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

export function PlayerView({ player, view, isExpanded, lang }: Props) {
  const current = player.summary?.current_season;
  const totals = player.summary?.club_totals;
  const role = player.captain_since && !player.vice_captain_since ? tr(lang, 'Captain', '주장') : player.vice_captain_since ? tr(lang, 'Vice-captain', '부주장') : null;
  const age = `${player.age.approximate ? (lang === 'ko' ? '약 ' : 'c. ') : ''}${player.age.years}`;
  const figures: Array<[string, string | number]> = view === 'fan'
    ? [[tr(lang, 'Age', '나이'), lang === 'ko' ? `${age}세` : age], [tr(lang, 'Caps', '대표팀 출전'), player.national_team?.caps ?? 0], [tr(lang, 'Club goals', '구단 통산 골'), totals?.goals ?? 0]]
    : [[tr(lang, 'Season goals', '시즌 득점'), current?.goals ?? 0], [tr(lang, 'Club apps', '구단 출전'), totals?.appearances ?? 0], [tr(lang, 'Caps', '대표팀 출전'), player.national_team?.caps ?? 0]];
  return (
    <>
      <Figures items={figures} />
      <Pronounce name={displayPlayerName(player.name, player.native_name, lang)} nativeName={player.native_name} respelling={player.pronunciation} nationality={player.nationality} lang={lang} />
      {player.name_note && <p className="note">{playerNarrative(player.id, player.name_note, lang)}</p>}
      {view === 'fan' ? (
        <>
          <details open><summary>{tr(lang, 'Journey', '선수 여정')}</summary><Journey player={player} lang={lang} /></details>
          <details open><summary>{displayCountryName(player.nationality, lang)}</summary><NationalTeamLine player={player} lang={lang} />{player.country && <p className="muted">{playerNarrative(player.id, player.country.background, lang)}</p>}</details>
          {player.fan_nickname && <details open><summary>{tr(lang, 'What fans call him', '팬들이 부르는 별명')}</summary><p className="quote">“{playerNarrative(player.id, player.fan_nickname, lang)}”</p></details>}
        </>
      ) : (
        <>
          <details open>
            <summary>{tr(lang, 'On air', '중계용 정보')}</summary>
            <ul className="facts">
              {role && <li>{role} · {displayClubName(player.club.name, lang)}</li>}
              {current && <li>{lang === 'ko' ? `이번 시즌: ${current.appearances}경기 ${current.goals}골 ${current.assists}도움` : `This season: ${current.appearances} apps, ${current.goals} goals, ${current.assists} assists`}</li>}
              {totals && <li>{lang === 'ko' ? `구단 통산: ${totals.seasons}시즌 ${totals.appearances}경기 ${totals.goals}골` : `For the club: ${totals.appearances} apps, ${totals.goals} goals in ${totals.seasons} league seasons`}</li>}
              {player.summary?.rookie && <li>{tr(lang, 'Rookie: first senior seasons', '신예 선수: 성인 무대 초기 시즌')}</li>}
            </ul>
          </details>
          <details open><summary>{tr(lang, 'International', '국가대표')}</summary><NationalTeamLine player={player} lang={lang} /></details>
        </>
      )}
      {isExpanded && (
        <details open>
          <summary>{lang === 'ko' ? `${displayClubName(player.club.name, lang)} 리그 시즌 기록` : `League seasons for ${player.club.name}`}</summary>
          <SeasonTable player={player} lang={lang} />
          {/* Each reason already names its season. */}
          {player.unavailable.map((u) => <p key={u.season} className="muted">{u.reason}</p>)}
          {player.notes && <p className="muted">{player.notes}</p>}
        </details>
      )}
      <p className="source">{tr(lang, 'Fictional records · authored world pack', '가상 기록 · 창작 세계관 자료')}</p>
    </>
  );
}
