import type { ClubDetail, Lang, Mode, Result } from './api';
import { Pronounce } from './Pronounce';
import { clubStory, clubTerm, displayClubName, displayClubNickname, displayGroundName, tr } from './i18n';

type Props = { club: ClubDetail; view: Mode; isExpanded: boolean; lang: Lang };

function Form({ results, lang }: { results: Result[]; lang: Lang }) {
  return (
    <ol className="form" aria-label={tr(lang, 'Last five league results, oldest first', '최근 리그 5경기 결과, 오래된 순서')}>
      {results.map((r) => <li key={`${r.season}-${r.matchday}`} className={`form-${r.outcome}`} title={tr(lang, `${r.season} matchday ${r.matchday}: ${r.score}`, `${r.season} ${r.matchday}라운드: ${r.score}`)}>{lang === 'ko' ? ({ W: '승', D: '무', L: '패' } as Record<string, string>)[r.outcome] : r.outcome}</li>)}
    </ol>
  );
}

export function ClubView({ club, view, isExpanded, lang }: Props) {
  const content = club.content;
  const terms = content?.fan_language.filter((t) => (view === 'fan' ? t.register !== 'broadcast' : t.register !== 'fan')) ?? [];
  const manager = club.staff.find((s) => s.role === 'Manager');
  const history = isExpanded ? content?.history : content?.history.slice(0, 3);
  const standing = club.standing;
  const nickname = displayClubNickname(content?.nickname, lang);
  const honours: Record<string, string> = lang === 'ko' ? { 'Brenmoor League champions': '브렌무어 리그 우승', 'Brenmoor Cup winners': '브렌무어 컵 우승' } : {};
  return (
    <>
      {standing && (
        <dl className="figures">
          <div><dt>{tr(lang, 'Position', '순위')}</dt><dd>{lang === 'ko' ? `${standing.position}위` : ordinal(standing.position)}</dd></div>
          <div><dt>{tr(lang, 'Points', '승점')}</dt><dd>{standing.points}</dd></div>
          <div><dt>{tr(lang, 'Played', '경기 수')}</dt><dd>{standing.played}</dd></div>
        </dl>
      )}
      <Pronounce name={displayClubName(club.name, lang)} respelling={content?.pronunciation} lang={lang} />
      {club.summary && <Form results={club.summary.last_five} lang={lang} />}
      {view === 'fan' ? (
        <>
          <details open><summary>{tr(lang, 'Story', '구단 이야기')}</summary><ol className="journey">{history?.map((h) => <li key={h.year}><strong>{h.year}</strong> {clubStory(h.src, String(h.year), h.text, lang).text}</li>)}</ol></details>
          <details open><summary>{tr(lang, 'In the stands', '관중석 문화')}</summary>{content?.culture.map((c) => { const story = clubStory(c.src ?? '', c.title, c.text, lang); return <p key={c.title}><strong>{story.title}.</strong> {story.text}</p>; })}</details>
        </>
      ) : (
        <details open>
          <summary>{tr(lang, 'On air', '중계용 정보')}</summary>
          <ul className="facts">
            <li>{tr(lang, 'Nickname', '별칭')}: {nickname}</li>
            <li>{tr(lang, 'Ground', '경기장')}: {displayGroundName(club.ground, lang)} ({club.capacity.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-GB')})</li>
            {manager && <li>{tr(lang, 'Manager', '감독')}: {manager.name}{manager.pronunciation ? ` (${manager.pronunciation})` : ''}, {tr(lang, 'since', '부임')} {manager.since.slice(0, 4)}</li>}
          </ul>
        </details>
      )}
      <details open>
        <summary>{view === 'fan' ? tr(lang, 'Fan language', '팬 표현') : tr(lang, 'Terms to use', '중계 권장 용어')}</summary>
        <dl className="terms">{terms.map((t) => { const localized = clubTerm(t.term, t.meaning, lang); return <div key={t.term}><dt>{localized.term}</dt><dd>{localized.meaning}</dd></div>; })}</dl>
      </details>
      {isExpanded && club.summary && (
        <details open><summary>{tr(lang, 'Last ten seasons', '최근 10시즌')}</summary><ul className="facts">{club.summary.finishes.map((f) => <li key={f.season}>{f.season}: {f.position ? `${lang === 'ko' ? `${f.position}위` : ordinal(f.position)}, ${f.points} ${tr(lang, 'pts', '승점')}` : f.division}</li>)}</ul></details>
      )}
      {isExpanded && content && (
        <details open><summary>{tr(lang, 'Honours', '주요 우승')}</summary><ul className="facts">{content.honours.map((h) => <li key={h.title}>{honours[h.title] ?? h.title}: {h.seasons.join(', ')}</li>)}</ul></details>
      )}
      <p className="source">{tr(lang, 'Fictional club · authored world pack', '가상 구단 · 창작 세계관 자료')}</p>
    </>
  );
}

export function ordinal(n: number) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}
