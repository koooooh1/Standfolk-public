import { useEffect, useState } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { getJson, type ClubDetail, type Lang, type Mode, type PlayerDetail } from './api';
import { AskBox } from './Ask';
import { ClubView } from './ClubView';
import { PlayerView } from './PlayerView';
import { CrestImage, Portrait } from './Portrait';
import { displayClubName, displayClubNickname, displayCountryName, displayGroundName, displayPlayerName, tr } from './i18n';

export type Focus = { kind: 'player' | 'club'; id: string };
type Loaded = { focus: Focus; player?: PlayerDetail; club?: ClubDetail } | { focus: Focus; error: string };

type Props = { focus: Focus; mode: Mode; atMs: number; isExpanded: boolean; onExpand: (value: boolean) => void; onClose: () => void; lang: Lang };

function Hero({ loaded, lang }: { loaded: Loaded; lang: Lang }) {
  if ('error' in loaded) return null;
  if (loaded.player) {
    const p = loaded.player;
    return (
      <div className="hero" style={{ ['--club' as string]: p.club.colors[0] }}>
        <Portrait id={p.id} number={p.number} color={p.club.colors[0]} size={72} name={displayPlayerName(p.name, p.native_name, lang)} />
        <div>
          <p className="hero-kicker">#{p.number} · {lang === 'ko' ? ({ Goalkeeper: '골키퍼', Defender: '수비수', Midfielder: '미드필더', Forward: '공격수' } as Record<string, string>)[p.detail] ?? p.detail : p.detail}</p>
          <h2>{displayPlayerName(p.name, p.native_name, lang)}</h2>
          <p className="hero-sub">{displayClubName(p.club.name, lang)} · {displayCountryName(p.nationality, lang)}</p>
        </div>
      </div>
    );
  }
  const c = loaded.club!;
  return (
    <div className="hero" style={{ ['--club' as string]: c.colors[0] }}>
      <CrestImage id={c.id} short={c.short} color={c.colors[0]} size={64} />
      <div>
        <p className="hero-kicker">{tr(lang, 'Founded', '창단')} {c.founded} · {displayGroundName(c.ground, lang)}</p>
          <h2>{displayClubName(c.name, lang)}</h2>
        <p className="hero-sub">{displayClubNickname(c.content?.nickname, lang)}</p>
      </div>
    </div>
  );
}

export function SidePanel({ focus, mode, atMs, isExpanded, onExpand, onClose, lang }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [view, setView] = useState<'profile' | 'ask'>('profile');

  useEffect(() => {
    let isCurrent = true;
    const url = focus.kind === 'player' ? `/api/players/${focus.id}` : `/api/clubs/${focus.id}`;
    getJson<PlayerDetail | ClubDetail>(url)
      .then((data) => { if (isCurrent) setLoaded(focus.kind === 'player' ? { focus, player: data as PlayerDetail } : { focus, club: data as ClubDetail }); })
      .catch((err: unknown) => { if (isCurrent) setLoaded({ focus, error: lang === 'ko' ? '정보를 불러오지 못했습니다.' : err instanceof Error ? err.message : 'Could not load.' }); });
    return () => { isCurrent = false; };
  }, [focus, lang]);

  const current = loaded && loaded.focus === focus ? loaded : null;
  return (
    <aside className={`panel${isExpanded ? ' panel-expanded' : ''}`} aria-label={tr(lang, 'Player and club information', '선수·구단 정보')}>
      <button type="button" className="sheet-handle" onClick={() => onExpand(!isExpanded)} aria-label={isExpanded ? tr(lang, 'Show less', '간략히 보기') : tr(lang, 'Show more', '더 보기')} />
      <div className="panel-actions">
        <button type="button" className="icon-button" onClick={() => onExpand(!isExpanded)} aria-label={isExpanded ? tr(lang, 'Collapse panel', '패널 접기') : tr(lang, 'Expand panel', '패널 펼치기')}>
          {isExpanded ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="icon-button" onClick={onClose} aria-label={tr(lang, 'Close panel', '패널 닫기')}><X size={18} aria-hidden="true" /></button>
      </div>
      {!current && <p className="muted">{tr(lang, 'Loading…', '불러오는 중…')}</p>}
      {current && 'error' in current && <p role="alert">{current.error}</p>}
      {current && <Hero loaded={current} lang={lang} />}
      <div className="segmented panel-views" role="group" aria-label={tr(lang, 'Panel view', '패널 보기')}>
        <button type="button" aria-pressed={view === 'profile'} onClick={() => setView('profile')}>{tr(lang, 'Profile', '프로필')}</button>
        <button type="button" aria-pressed={view === 'ask'} onClick={() => setView('ask')}>{tr(lang, 'Ask', '질문')}</button>
      </div>
      {view === 'ask' ? <AskBox key={focus.id} subject={focus} atMs={atMs} lang={lang} /> : (
        <div className="panel-body">
          {current && 'player' in current && current.player && <PlayerView player={current.player} view={mode} isExpanded={isExpanded} lang={lang} />}
          {current && 'club' in current && current.club && <ClubView club={current.club} view={mode} isExpanded={isExpanded} lang={lang} />}
        </div>
      )}
    </aside>
  );
}
