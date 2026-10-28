import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Compass, Headphones, MessageCircle, Music2 } from 'lucide-react';
import { getJson, type ClubDetail, type DemoMatch, type Lang, type Snapshot } from './api';
import { AskBox } from './Ask';
import { clubStory, displayClubName, displayPlayerName, tr } from './i18n';
import { nameIndex } from './Replay';
import type { Focus } from './SidePanel';

type Props = {
  match: DemoMatch;
  snapshot: Snapshot | null;
  atMs: number;
  lang: Lang;
  onWatch: () => void;
  onFocus: (focus: Focus) => void;
};

const CHANT = '/media/vellmouth-harbour-chant.mp4';

export function Discover({ match, snapshot, atMs, lang, onWatch, onFocus }: Props) {
  const [club, setClub] = useState<ClubDetail | null>(null);
  const names = useMemo(() => nameIndex(match, lang), [match, lang]);
  const latestGoal = [...(snapshot?.events ?? [])].reverse().find((event) => event.type === 'goal' && !event.retracted);
  const featuredId = latestGoal?.player ?? match.leaders.goals[0]?.id;
  const featured = [...match.home.lineup.starters, ...match.home.lineup.bench, ...match.away.lineup.starters, ...match.away.lineup.bench].find((p) => p.id === featuredId)
    ?? match.leaders.goals[0];
  const culture = club?.content?.culture.find((item) => item.kind !== 'chant_background') ?? club?.content?.culture[0];
  const cultureCopy = culture ? clubStory(culture.src ?? '', culture.title, culture.text, lang) : null;

  useEffect(() => {
    let current = true;
    getJson<ClubDetail>(`/api/clubs/${match.home.id}`)
      .then((result) => { if (current) setClub(result); })
      .catch(() => { if (current) setClub(null); });
    return () => { current = false; };
  }, [match.home.id]);

  return (
    <section className="discover" aria-labelledby="discover-title">
      <header className="discover-heading">
        <span className="discover-eyebrow"><Compass size={15} aria-hidden="true" />{tr(lang, 'A guide to this match', '이 경기를 위한 추천')}</span>
        <h1 id="discover-title">{tr(lang, 'Discover', '둘러보기')}</h1>
        <p>{tr(lang, 'Stories, people, club culture and questions worth exploring, gathered in one place.', '이 경기의 이야기와 선수 여정, 구단 문화, 궁금한 점을 한곳에서 살펴보세요.')}</p>
      </header>

      <div className="discover-grid">
        <section className="card discover-recommendations" aria-labelledby="recommendations-title">
          <div className="discover-section-title"><h2 id="recommendations-title">{tr(lang, 'Picked for you', '이 경기에서 더 알아보기')}</h2><span>{tr(lang, 'Based on the replay so far', '현재 경기 진행 상황 기준')}</span></div>
          <article className="discover-pick discover-pick-match">
            <span className="discover-pick-index">01</span>
            <div>
              <p className="discover-kicker">{tr(lang, 'Match moment', '경기 장면')}</p>
              <h3>{latestGoal
                ? tr(lang, `${names.get(latestGoal.player ?? '') ?? 'A scorer'} scored at ${latestGoal.minute}′`, `${latestGoal.minute}′ ${names.get(latestGoal.player ?? '') ?? '득점 선수'}의 골 장면`)
                : tr(lang, 'Follow the match as it unfolds', '진행 중인 경기를 따라가 보세요')}</h3>
              <p>{latestGoal
                ? tr(lang, 'See the goal and its verified build-up in the Watch timeline.', 'Watch에서 득점 장면과 확인된 빌드업을 살펴보세요.')
                : tr(lang, 'The live timeline adds moments as the replay clock advances.', '리플레이 시간이 흐르면 주요 장면이 타임라인에 추가됩니다.')}</p>
              <button type="button" className="discover-link" onClick={onWatch}>{tr(lang, 'Open Watch', '경기 보기')} <ArrowUpRight size={15} aria-hidden="true" /></button>
            </div>
          </article>

          {featured && (
            <article className="discover-pick">
              <span className="discover-pick-index">02</span>
              <div>
                <p className="discover-kicker">{tr(lang, 'Player journey', '선수 여정')}</p>
                <h3>{displayPlayerName(featured.name, featured.native_name, lang)}</h3>
                <p>{tr(lang, `${featured.pos} · ${featured.season_goals} league goals this season`, `${featured.pos} · 이번 시즌 리그 ${featured.season_goals}골`)}</p>
                <button type="button" className="discover-link" onClick={() => onFocus({ kind: 'player', id: featured.id })}>{tr(lang, 'Explore player profile', '선수 프로필 보기')} <ArrowUpRight size={15} aria-hidden="true" /></button>
              </div>
            </article>
          )}

          {culture && (
            <article className="discover-pick">
              <span className="discover-pick-index">03</span>
              <div>
                <p className="discover-kicker">{tr(lang, 'Club culture', '구단 문화')}</p>
                <h3>{cultureCopy?.title ?? culture.title}</h3>
                <p>{cultureCopy?.text ?? culture.text}</p>
                <span className="discover-source">{tr(lang, 'From the authored fictional world pack', '가상 세계관 자료집')}</span>
              </div>
            </article>
          )}
        </section>

        <section className="card discover-chant" aria-labelledby="chant-title">
          <div className="discover-section-title"><h2 id="chant-title">{tr(lang, 'The tide-bell song', '밀물종 응원가')}</h2><span><Music2 size={14} aria-hidden="true" /> {displayClubName('Vellmouth Rovers', lang)}</span></div>
          <p className="discover-chant-intro">{tr(lang, 'After a home goal, the north stand rings the harbour bell three times, then sings.', '홈팀이 골을 넣으면 북쪽 관중석에서 항구 종을 세 번 울리고 노래합니다.')}</p>
          <video className="discover-video" controls preload="metadata" playsInline poster="/media/vellmouth-harbour-chant-poster.png" aria-label={tr(lang, 'Play the original Vellmouth Rovers supporters’ chant', '벨머스 로버스 오리지널 응원가 재생')}>
            <source src={CHANT} type="video/mp4" />
            {tr(lang, 'Your browser cannot play this MP4.', '브라우저에서 이 MP4를 재생할 수 없습니다.')}
          </video>
          <div className="discover-audio-meta"><Headphones size={15} aria-hidden="true" /><span>{tr(lang, 'English synthetic vocals · original demo composition, not a crowd recording', '영어 합성 보컬 · 오리지널 데모 작곡이며 실제 관중 녹음은 아닙니다')}</span></div>
          <details className="discover-lyrics">
            <summary>{tr(lang, 'Read the lyrics', '가사 보기')}</summary>
            <p lang="en">Ring the bell, let the harbour know<br />Tide and teal, our voices flow<br />Vellmouth Rovers, side by side<br />Carry us home on the harbour tide</p>
            <p lang="ko">종을 울려 항구에 알리자<br />물결과 청록빛, 목소리를 모아<br />벨머스 로버스, 나란히 서서<br />항구의 물결 따라 우리를 집으로</p>
          </details>
        </section>

        <section className="card discover-ask" aria-labelledby="discover-ask-title">
          <div className="discover-section-title"><h2 id="discover-ask-title"><MessageCircle size={18} aria-hidden="true" />{tr(lang, 'Ask about what you found', '더 궁금한 점 물어보기')}</h2><span>{tr(lang, 'Answers use match and world-pack evidence', '경기와 세계관 자료에 근거해 답변')}</span></div>
          <AskBox subject={null} atMs={atMs} lang={lang} />
        </section>
      </div>
    </section>
  );
}
