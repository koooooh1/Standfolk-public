import { useEffect, useRef, useState } from 'react';
import { AgentSteps, AskBox, sourceLabel, type Approved } from './Ask';
import { postJson, type AskResult, type Depth, type Lang, type MatchEvent, type Overlay } from './api';
import { tr } from './i18n';

// Producer view (D2, PRD Studio): each goal or substitution up to the replay clock becomes a story candidate written
// by the agents. The producer edits (every edit is re-checked by the API), holds, or approves; approving and taking a
// story on air are separate steps. Taking a story to air goes through the API, which checks it again and shows it on
// Watch; the rest of the Studio state lives only in this browser tab. An approved Ask answer is a preview only.
interface Story { id: string; minute: number; type: 'goal' | 'sub'; short: string; long: string; engine: AskResult['engine']; sources: AskResult['sources']; agent: AskResult['agent'] }
type Status = 'drafting' | 'ready' | 'held' | 'approved' | 'retracted' | 'failed';
interface Card { story: Story | null; text: string; checkedText: string | null; problem: string | null; status: Status; version: number; approving?: boolean; recovery?: AskResult['agent'] | 'running' | 'failed' }

const statusText = (status: Status, lang: Lang) => ({
  drafting: tr(lang, 'Agents drafting…', '에이전트가 작성 중…'),
  ready: tr(lang, 'Ready for review', '검토 준비 완료'),
  held: tr(lang, 'Held', '보류됨'),
  approved: tr(lang, 'Approved', '승인됨'),
  retracted: tr(lang, 'Retracted (disallowed)', '취소됨 (무효 처리)'),
  failed: tr(lang, 'Could not draft', '문안을 작성하지 못했습니다')
})[status];

function StoryCard({ card, onEdit, onCheck, onHold, onApprove, onAir, onRecovery, lang }: { card: Card; onEdit: (text: string) => void; onCheck: () => void; onHold: () => void; onApprove: () => void; onAir: () => void; onRecovery: () => void; lang: Lang }) {
  const { story, text, checkedText, problem, status, version, recovery, approving } = card;
  if (!story) return <li className="story-card"><p className="muted">{statusText(status, lang)}</p></li>;
  const isChecked = checkedText === text;
  const isRetracted = status === 'retracted';
  return (
    <li className={`story-card story-${status}`}>
      <div className="story-head">
        <strong>{story.short}</strong>
        <span className="story-status">{statusText(status, lang)}{version > 0 ? ` · v${version}` : ''}</span>
      </div>
      <label className="note" htmlFor={`copy-${story.id}`}>{tr(lang, 'Long copy', '상세 문안')} ({story.engine === 'agents' ? tr(lang, 'agent wording', '에이전트 작성') : tr(lang, 'template wording', '템플릿 문안')})</label>
      <textarea id={`copy-${story.id}`} className="story-copy" value={text} rows={4} maxLength={1000} disabled={status === 'approved' || isRetracted || approving} onChange={(e) => onEdit(e.target.value)} />
      {problem && <p role="alert" className="story-problem">{tr(lang, 'Blocked', '차단됨')}: {problem}.</p>}
      <div className="story-actions">
        {!isChecked && <button type="button" onClick={onCheck} disabled={isRetracted || approving}>{tr(lang, 'Check edit', '수정 문안 검증')}</button>}
        <button type="button" onClick={onHold} disabled={status === 'approved' || isRetracted || approving}>{status === 'held' ? tr(lang, 'Release', '보류 해제') : tr(lang, 'Hold', '보류')}</button>
        <button type="button" className="story-action-primary" onClick={onApprove} disabled={!isChecked || status === 'held' || status === 'approved' || isRetracted || approving}>{approving ? tr(lang, 'Approving…', '승인 중…') : tr(lang, 'Approve', '승인')}</button>
        <button type="button" className="story-action-primary" onClick={onAir} disabled={status !== 'approved' || isRetracted || approving}>{tr(lang, 'Take to air', '송출')}</button>
        <button type="button" onClick={onRecovery} disabled={isRetracted || approving || recovery === 'running'}>{tr(lang, 'Show recovery (demo)', '복구 시연 보기')}</button>
      </div>
      <AgentSteps agent={story.agent} lang={lang} />
      {recovery && (
        <div className="recovery">
          <p className="note"><strong>{tr(lang, 'Recovery demonstration:', '복구 시연:')}</strong> {tr(lang, 'two scripted drafts with a wrong figure go through the real review; no model call.', '잘못된 숫자가 든 두 문안을 실제 검토 절차에 통과시킵니다. 모델 호출은 없습니다.')}</p>
          {recovery === 'running' && <p className="muted">{tr(lang, 'Running the review…', '문안을 검토 중…')}</p>}
          {recovery === 'failed' && <p role="alert">{tr(lang, 'The agent service is not available.', '에이전트 서비스를 사용할 수 없습니다.')}</p>}
          {typeof recovery === 'object' && <AgentSteps agent={recovery} lang={lang} />}
        </div>
      )}
      {story.sources.length > 0 && <p className="note">{tr(lang, 'Sources', '출처')}: {story.sources.map((s) => sourceLabel(s.label, lang)).join(' · ')}</p>}
    </li>
  );
}

function QueueItem({ minute, type, card, selected, onSelect, lang }: { minute: number; type: 'goal' | 'sub'; card: Card; selected: boolean; onSelect: () => void; lang: Lang }) {
  return (
    <li>
      <button type="button" className="studio-queue-item" aria-pressed={selected} onClick={onSelect}>
        <span className="studio-queue-meta">{minute}′ · {type.toUpperCase()}</span>
        <span className="studio-queue-status">{statusText(card.status, lang)}</span>
        <strong>{card.story?.short ?? (card.status === 'drafting' ? tr(lang, 'Drafting story…', '스토리 작성 중…') : tr(lang, 'Story unavailable', '스토리를 사용할 수 없습니다'))}</strong>
      </button>
    </li>
  );
}

export function Studio({ atMs, events, lang = 'en', depth = 'short' }: { atMs: number; events: MatchEvent[]; lang?: Lang; depth?: Depth }) {
  const moments = events.filter((e) => e.type === 'goal' || e.type === 'sub');
  const [cards, setCards] = useState<Record<string, Card>>({});
  const [onAir, setOnAir] = useState<Overlay | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requested = useRef(new Set<string>());
  const update = (id: string, change: (card: Card) => Card) => setCards((all) => (all[id] ? { ...all, [id]: change(all[id]) } : all));

  const retractedIds = moments.filter((m) => m.retracted).map((m) => m.id).join(',');
  // Each moment is drafted once per visit; the API keeps the agents' story, so revisiting costs no model call.
  const momentIds = moments.map((m) => m.id).join(',');
  useEffect(() => {
    const body = { at_ms: atMs, ...(lang === 'ko' ? { lang } : {}), ...(depth === 'detailed' ? { depth } : {}) };
    for (const moment of moments) {
      const { id } = moment;
      const key = `${id}:${lang}:${depth}`;
      if (requested.current.has(key)) continue;
      if (moment.retracted) {
        setCards((all) => ({ ...all, [id]: { story: null, text: '', checkedText: null, problem: null, status: 'retracted', version: 0 } }));
        continue;
      }
      requested.current.add(key);
      setCards((all) => ({ ...all, [id]: { story: null, text: '', checkedText: null, problem: null, status: 'drafting', version: 0 } }));
      postJson<Story>(`/api/studio/stories/${id}`, body)
        .then((story) => update(id, (c) => c.status === 'retracted' ? c : { ...c, story, text: story.long, checkedText: story.long, status: 'ready' }))
        .catch(() => update(id, (c) => c.status === 'retracted' ? c : { ...c, status: 'failed' }));
    }
  }, [momentIds, retractedIds, lang, depth]);

  useEffect(() => {
    const retracted = new Set(retractedIds ? retractedIds.split(',') : []);
    setCards((all) => Object.fromEntries(Object.entries(all).map(([id, card]) => [id, retracted.has(id)
      ? { ...card, status: 'retracted' }
      : card.status === 'retracted' ? { ...card, status: card.story ? 'ready' : 'drafting' } : card])));
    setOnAir((cur) => cur && retracted.has(cur.card_id) ? null : cur);
  }, [retractedIds]);

  const check = async (id: string) => {
    const text = cards[id].text;
    try {
      const result = await postJson<{ ok: boolean; problem: string | null }>(`/api/studio/stories/${id}/check`, { text });
      update(id, (c) => (c.text === text ? { ...c, checkedText: result.ok ? text : null, problem: result.problem } : c));
    } catch (err: unknown) {
      update(id, (c) => ({ ...c, problem: err instanceof Error ? err.message : 'the check failed' }));
    }
  };
  const showRecovery = async (id: string) => {
    update(id, (c) => ({ ...c, recovery: 'running' }));
    try {
      const { agent } = await postJson<{ agent: AskResult['agent'] }>(`/api/studio/stories/${id}/recovery`, { at_ms: atMs });
      update(id, (c) => ({ ...c, recovery: agent }));
    } catch {
      update(id, (c) => ({ ...c, recovery: 'failed' }));
    }
  };
  const approve = async (id: string, card: Card) => {
    if (!card.story || card.checkedText !== card.text) return;
    const version = card.version + 1;
    update(id, (c) => ({ ...c, approving: true, problem: null }));
    try {
      await postJson<{ approved: boolean; version: number }>(`/api/studio/stories/${id}/approve`, {
        text: card.text, version, engine: card.story.engine, at_ms: atMs
      });
      update(id, (c) => ({ ...c, approving: false, status: c.status === 'retracted' ? 'retracted' : 'approved', version }));
    } catch (err: unknown) {
      update(id, (c) => ({ ...c, approving: false, problem: err instanceof Error ? err.message : 'approval failed' }));
    }
  };
  const takeToAir = async (id: string, card: Card) => {
    if (!card.story || card.status !== 'approved' || card.checkedText !== card.text) return;
    try {
      setOnAir(await postJson<Overlay>(`/api/studio/stories/${id}/air`, { text: card.text, version: card.version, engine: card.story.engine, at_ms: atMs }));
    } catch (err: unknown) {
      update(id, (c) => ({ ...c, problem: err instanceof Error ? err.message : 'taking the story to air failed' }));
    }
  };
  const fromAsk = (a: Approved) => setOnAir({ schema_version: '1', card_id: 'ask', version: 1, short: a.question, long: a.answer, evidence: [], valid_from_ms: a.atMs, engine: a.engine, synthetic: true });
  const queue = [...moments].reverse().flatMap((moment) => {
    const card = cards[moment.id];
    return card ? [{ id: moment.id, minute: moment.minute, type: moment.type as 'goal' | 'sub', card }] : [];
  });
  const selected = queue.find((item) => item.id === selectedId) ?? queue[0] ?? null;
  const outputIsLive = Boolean(onAir && onAir.card_id !== 'ask');

  return (
    <div className="studio">
      <div className="studio-queue-column">
        <section className="card studio-queue-panel">
          <div className="studio-panel-heading"><h2>{tr(lang, 'Story queue', '스토리 대기열')}</h2><span className="studio-count">{lang === 'ko' ? `${queue.length}개 장면` : `${queue.length} moments`}</span></div>
          {queue.length === 0 && <p className="muted">{tr(lang, 'Goals and substitutions appear here as the replay reaches them.', '리플레이가 진행되면 득점과 교체 장면이 여기에 표시됩니다.')}</p>}
          <ol className="studio-queue-list">
            {queue.map(({ id, minute, type, card }) => (
              <QueueItem key={id} minute={minute} type={type} card={card} selected={selected?.id === id} onSelect={() => setSelectedId(id)} lang={lang} />
            ))}
          </ol>
        </section>
        <section className="card studio-ask">
          <h2>{tr(lang, 'Ask and review', '질문하고 검토하기')}</h2>
          <AskBox subject={null} atMs={atMs} onApprove={fromAsk} lang={lang} />
        </section>
      </div>
      <section className="card studio-editor">
        <div className="studio-panel-heading">
          <h2>{selected?.card.status === 'approved' ? (lang === 'ko' ? `승인 문안 · v${selected.card.version}` : `Approved copy · v${selected.card.version}`) : tr(lang, 'Review copy', '문안 검토')}</h2>
          {selected?.card.story && <span className="studio-evidence-badge">{tr(lang, 'Evidence attached', '근거 연결됨')}</span>}
        </div>
        {selected ? (
          <ol className="studio-selected-story">
            <StoryCard key={selected.id} card={selected.card} lang={lang}
              onEdit={(text) => update(selected.id, (c) => ({ ...c, text, problem: null }))}
              onCheck={() => void check(selected.id)}
              onHold={() => update(selected.id, (c) => ({ ...c, status: c.status === 'held' ? 'ready' : 'held' }))}
              onApprove={() => void approve(selected.id, selected.card)}
              onAir={() => void takeToAir(selected.id, selected.card)}
              onRecovery={() => void showRecovery(selected.id)} />
          </ol>
        ) : <p className="muted">{tr(lang, 'Select a story after the replay reaches a goal or substitution.', '리플레이에서 득점 또는 교체 장면이 나온 후 스토리를 선택하세요.')}</p>}
      </section>
      <section className="card studio-preview" aria-live="polite">
        <div className="studio-panel-heading"><h2>{tr(lang, 'Fan output', '팬 화면 송출 결과')}</h2><span className={`studio-on-air${outputIsLive ? ' is-live' : ''}`}>{outputIsLive ? tr(lang, 'On air', '송출 중') : onAir ? tr(lang, 'Ask preview', '질문 답변 미리보기') : tr(lang, 'Preview', '미리보기')}</span></div>
        <div className="broadcast-frame">
          {onAir ? (
            <div className="lower-third">
              <p className="lower-third-short">{onAir.short}</p>
              <p className="lower-third-long">{onAir.long}</p>
            </div>
          ) : <p className="broadcast-empty">{tr(lang, 'No output yet. A story taken on air or an Ask preview will appear here.', '아직 송출 결과가 없습니다. 스토리를 송출하거나 질문 답변을 미리 보면 여기에 표시됩니다.')}</p>}
        </div>
        {onAir && (
          <>
            <p className="note">{onAir.engine === 'agents' ? tr(lang, 'Agent wording', '에이전트 문안') : tr(lang, 'Template wording', '템플릿 문안')} · {tr(lang, 'Synthetic match', '가상 경기')} · {onAir.card_id === 'ask' ? tr(lang, 'Preview only', '미리보기 전용') : tr(lang, 'On air for fans on Watch', '팬 Watch 화면에 송출 중')}</p>
            <details className="note"><summary>{tr(lang, 'Overlay JSON', '오버레이 JSON')}</summary><pre>{JSON.stringify(onAir, null, 2)}</pre></details>
          </>
        )}
      </section>
    </div>
  );
}
