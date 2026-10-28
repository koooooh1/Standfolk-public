import { useEffect, useState } from 'react';
import { ArrowLeftRight, CircleDot, Pause, Play, RotateCcw, Square } from 'lucide-react';
import { getJson, type DemoMatch, type Depth, type Lang, type MatchEvent, type Snapshot } from './api';
import type { Focus } from './SidePanel';
import { displayPlayerName, tr } from './i18n';

const MINUTE_MS = 60_000;
const DURATION_MS = 90 * MINUTE_MS;
// One match minute per second: the whole demo plays in 90 seconds.
const TICK_MS = 1000;
const PAUSED_REFRESH_MS = 5000;
const KEY_TYPES: MatchEvent['type'][] = ['goal', 'sub', 'yellow'];

// The page only ever holds the match up to the clock: each step asks the server for that moment.
export function useReplay(lang: Lang = 'en') {
  const [atMs, setAtMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    getJson<Snapshot>(`/api/match/demo/events?at_ms=${atMs}${lang === 'ko' ? '&lang=ko' : ''}`)
      .then((s) => { if (isCurrent) { setSnapshot(s); setError(null); } })
      .catch((err: unknown) => { if (isCurrent) { setError(err instanceof Error ? err.message : 'Replay unavailable.'); setIsPlaying(false); } });
    return () => { isCurrent = false; };
  }, [atMs, refresh, lang]);

  // While paused the clock does not move, so ask again now and then: a story the Studio takes to air still shows.
  useEffect(() => {
    if (isPlaying) return;
    const id = window.setInterval(() => setRefresh((n) => n + 1), PAUSED_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => setAtMs((t) => Math.min(DURATION_MS, t + MINUTE_MS)), TICK_MS);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  useEffect(() => { if (atMs >= DURATION_MS) setIsPlaying(false); }, [atMs]);

  const toggle = () => { if (atMs >= DURATION_MS) setAtMs(0); setIsPlaying(!isPlaying); };
  const seek = (minute: number) => setAtMs(Math.max(0, Math.min(90, minute)) * MINUTE_MS);
  return { atMs, isPlaying, snapshot, error, toggle, seek };
}

export type Replay = ReturnType<typeof useReplay>;

export function statusText(s: Snapshot | null, lang: Lang = 'en') {
  if (!s || s.phase === 'pre') return tr(lang, 'Not started', '경기 전');
  if (s.phase === 'half_time') return tr(lang, 'Half-time', '하프타임');
  if (s.phase === 'full_time') return tr(lang, 'Full-time', '경기 종료');
  return `${s.minute}′`;
}

export function ReplayBar({ replay, lang = 'en' }: { replay: Replay; lang?: Lang }) {
  const minute = replay.atMs / MINUTE_MS;
  return (
    <section className="replay" aria-label={tr(lang, 'Match replay', '경기 리플레이')}>
      <button type="button" className="replay-play" onClick={replay.toggle} aria-label={replay.isPlaying ? tr(lang, 'Pause the replay', '리플레이 일시 정지') : tr(lang, 'Play the replay', '리플레이 재생')}>
        {replay.isPlaying ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
      </button>
      <input type="range" min={0} max={90} step={1} value={minute} onChange={(e) => replay.seek(Number(e.target.value))} aria-label={tr(lang, 'Match minute', '경기 시간')} aria-valuetext={statusText(replay.snapshot, lang)} />
      <span className="replay-clock">{String(minute).padStart(2, '0')}:00</span>
      <button type="button" className="icon-button" onClick={() => replay.seek(0)} aria-label={tr(lang, 'Back to kick-off', '경기 시작으로 이동')}><RotateCcw size={16} aria-hidden="true" /></button>
      {replay.error && <span className="replay-error" role="alert">{tr(lang, 'Replay unavailable', '리플레이를 사용할 수 없습니다')}: {replay.error}</span>}
    </section>
  );
}

// Names for event players come from both team sheets.
export function nameIndex(match: DemoMatch, lang: Lang = 'en') {
  return new Map([match.home, match.away].flatMap((s) => [...s.lineup.starters, ...s.lineup.bench]).map((p) => [p.id, displayPlayerName(p.name, p.native_name, lang)]));
}

const ICON = { goal: CircleDot, sub: ArrowLeftRight, yellow: Square } as const;

export function KeyMoments({ match, snapshot, onFocus, depth = 'short', lang = 'en' }: { match: DemoMatch; snapshot: Snapshot | null; onFocus: (f: Focus) => void; depth?: Depth; lang?: Lang }) {
  const names = nameIndex(match, lang);
  const moments = (snapshot?.events ?? []).filter((e) => KEY_TYPES.includes(e.type)).reverse();
  const side = (club: string | null) => (club === match.home.id ? match.home : match.away);
  const recap = snapshot?.recap ?? null;
  return (
    <section className="card summary-wide">
      {recap && (
        <div className="recap" role="region" aria-label={tr(lang, 'Full-time recap', '경기 종료 요약')}>
          <h3>{recap.headline}</h3>
          <p>{recap.summary}</p>
        </div>
      )}
      <h2>{tr(lang, 'Key moments', '주요 장면')}</h2>
      {moments.length === 0 && <p className="muted">{tr(lang, 'Nothing yet. Press play to start the synthetic match.', '아직 주요 장면이 없습니다. 재생 버튼을 눌러 가상 경기를 시작하세요.')}</p>}
      <ol className="moments">
        {moments.map((e) => {
          const Icon = ICON[e.type as keyof typeof ICON];
          const detail = e.retracted
            ? (lang === 'ko' ? `취소 (${e.retracted_reason?.includes('Offside') ? '오프사이드' : e.retracted_reason ?? '오프사이드'})` : `Disallowed (${e.retracted_reason ?? 'Offside'})`)
            : e.type === 'goal' ? (e.assist ? `${tr(lang, 'Assist', '도움')} ${names.get(e.assist)}` : tr(lang, 'Goal', '골')) : e.type === 'sub' ? `${tr(lang, 'On for', '교체 출전 · 대신')} ${names.get(e.player_off ?? '')}` : tr(lang, 'Yellow card', '경고');
          const chainText = e.buildup
            ? (lang === 'ko' ? ` · 패스 ${e.buildup.passes}회, 전진 ${e.buildup.progress_m}m${depth === 'detailed' ? ` (${e.buildup.chain.map((id) => names.get(id) ?? id).join(' → ')})` : ''}` : ` · ${e.buildup.passes} passes, ${e.buildup.progress_m} m${depth === 'detailed' ? ` (${e.buildup.chain.map((id) => names.get(id) ?? id).join(' → ')})` : ''}`)
            : '';
          return (
            <li key={e.id} className={`moment moment-${e.type}${e.retracted ? ' moment-retracted' : ''}`} style={{ ['--club' as string]: side(e.club).colors[0] }}>
              <span className="moment-minute">{e.minute}′</span>
              <Icon size={16} aria-hidden="true" />
              <button type="button" className="moment-player" onClick={() => e.player && onFocus({ kind: 'player', id: e.player })}>
                <strong>{names.get(e.player ?? '')}</strong> <span className="muted">{side(e.club).short} · {detail}{chainText}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Scorers under each team in the header, as "Go 12′" (excluding retracted goals).
export function scorers(match: DemoMatch, snapshot: Snapshot | null, club: string, lang: Lang = 'en') {
  const names = nameIndex(match, lang);
  return (snapshot?.events ?? []).filter((e) => e.type === 'goal' && !e.retracted && e.club === club).map((e) => `${(names.get(e.player ?? '') ?? '').split(' ').at(-1)} ${e.minute}′`);
}
