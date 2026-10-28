import { useState, type FormEvent } from 'react';
import { Check, SendHorizontal, X } from 'lucide-react';
import { postJson, type AgentOutcome, type AskResult, type Lang } from './api';
import type { Focus } from './SidePanel';
import { tr } from './i18n';

const QUESTION_MAX = 300;
const SUGGESTIONS: Record<'match' | Focus['kind'], Record<Lang, string[]>> = {
  match: { en: ['What is the score?', 'How many goals has Youngho Go scored?', 'When was Kestrin Athletic founded?', 'How do Vellmouth fans celebrate a home goal?'], ko: ['현재 점수가 어떻게 돼?', '고영호는 몇 골을 넣었어?', '케스트린 애슬레틱은 언제 창단했어?', '벨머스 팬들은 홈에서 골이 나면 어떻게 응원해?'] },
  player: { en: ['How do you say the name?', 'Goals so far?', 'Where is the player from?', 'How old is the player?'], ko: ['이름은 어떻게 발음해?', '이번 경기 몇 골이야?', '어느 나라 출신이야?', '몇 살이야?'] },
  club: { en: ['Goals so far?', 'When was the club founded?', 'Where do they play?'], ko: ['이번 경기 몇 골이야?', '언제 창단했어?', '홈구장이 어디야?'] }
};

type Turn = { question: string; result: AskResult | null; error: string | null; atMs: number };
export type Approved = { question: string; answer: string; engine: AskResult['engine']; atMs: number };

const OUTCOME_TEXT: Record<AgentOutcome, Record<Lang, string>> = {
  ok: { en: 'Agents answered', ko: '에이전트가 답변했습니다' },
  rejected: { en: 'Review failed twice; template kept', ko: '검토를 두 번 통과하지 못해 확인된 답변을 표시합니다' },
  rejected_by_api: { en: 'API gate refused the wording; template kept', ko: '검증 단계에서 문안을 거부해 확인된 답변을 표시합니다' },
  budget_exhausted: { en: 'Model budget reached; template kept', ko: '모델 사용 한도에 도달해 확인된 답변을 표시합니다' },
  timeout: { en: 'Agents ran out of time; template kept', ko: '응답 시간이 초과되어 확인된 답변을 표시합니다' },
  provider_error: { en: 'Model unavailable; template kept', ko: '모델을 사용할 수 없어 확인된 답변을 표시합니다' },
  no_model: { en: 'No model configured; template kept', ko: '모델이 설정되지 않아 확인된 답변을 표시합니다' }
};

export function sourceLabel(label: string, lang: Lang): string {
  if (lang === 'en') return label;
  const rules: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/^(.+): authored player record$/u, (m) => `${m[1]}: 선수 기록`],
    [/^(.+): authored club record$/u, (m) => `${m[1]}: 구단 기록`],
    [/^(.+): club history$/u, (m) => `${m[1]}: 구단 역사`],
    [/^(.+): club culture$/u, (m) => `${m[1]}: 구단 문화`],
    [/^(.+): fan language$/u, (m) => `${m[1]}: 팬 용어`],
    [/^(.+): football background$/u, (m) => `${m[1]}: 축구 배경`]
  ];
  for (const [pattern, translate] of rules) {
    const match = label.match(pattern);
    if (match) return translate(match);
  }
  const fixed: Record<string, string> = {
    'Season statistics (seeded world pack)': '시즌 통계 (가상 세계관 데이터)',
    'League glossary': '리그 용어집',
    'Brenmoor League: authored league record': '브렌무어 리그 기록'
  };
  return fixed[label] ?? label;
}

function agentDetail(detail: string, lang: Lang): string {
  if (lang === 'en') return detail;
  if (detail === 'Drafted an answer.') return '답변 초안을 작성했습니다.';
  if (detail === 'Rewrote the answer after review feedback.') return '검토 의견을 반영해 답변을 수정했습니다.';
  if (detail === 'Passed the number and name check.') return '숫자와 이름 근거 검사를 통과했습니다.';
  if (detail === 'Passed the number and name check; the critic accepted.') return '숫자와 이름 검사를 통과했고 검토 에이전트가 승인했습니다.';
  if (detail.startsWith('Passed on: ')) return `전달한 근거: ${detail.slice('Passed on: '.length)}`;
  if (detail.startsWith('Dropped as instructions: ')) return `지시문으로 판단해 제외: ${detail.slice('Dropped as instructions: '.length)}`;
  if (detail.includes('number and name check')) return '숫자 또는 이름 근거 검사를 통과하지 못했습니다.';
  if (detail.includes('showing the verified template answer')) return '확인된 템플릿 답변으로 전환했습니다.';
  return detail;
}

// Studio only: what each agent did for this answer. Fans see only the answer.
export function AgentSteps({ agent, lang = 'en' }: { agent: AskResult['agent']; lang?: Lang }) {
  if (!agent) return <p className="note">{tr(lang, 'Template answer; the agents were not called.', '확인된 템플릿 답변이며 에이전트는 호출하지 않았습니다.')}</p>;
  const { outcome, model_calls: calls, steps } = agent;
  return (
    <div className="agent-run">
      <p className="note">{OUTCOME_TEXT[outcome][lang]} · {lang === 'ko' ? `${calls}회 모델 호출` : `${calls} model ${calls === 1 ? 'call' : 'calls'}`}</p>
      <ol className="agent-steps">
        {steps.map((s, i) => (
          <li key={i} className={s.ok ? 'step-ok' : 'step-fail'}>
            {s.ok ? <Check size={14} aria-label={tr(lang, 'Passed', '통과')} /> : <X size={14} aria-label={tr(lang, 'Failed', '실패')} />}
            <span><strong>{lang === 'ko' ? ({ researcher: '조사 에이전트', writer: '작성 에이전트', reviewer: '검토 에이전트', fallback: '대체 처리' } as Record<string, string>)[s.agent] ?? s.agent : s.agent}</strong> · {lang === 'ko' ? ({ evidence: '근거 전달', draft: '초안', review: '검토', rewrite: '수정', template: '템플릿' } as Record<string, string>)[s.action] ?? s.action : s.action}: {agentDetail(s.detail, lang)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Answers come only from the world pack and the match up to the replay clock; agents may reword them, never add to them.
// With onApprove (Studio), each answer shows its agent steps and can be approved for the overlay preview.
export function AskBox({ subject, atMs, onApprove, lang = 'en' }: { subject: Focus | null; atMs: number; onApprove?: (approved: Approved) => void; lang?: Lang }) {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [isBusy, setIsBusy] = useState(false);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || isBusy) return;
    setIsBusy(true);
    setQuestion('');
    try {
      const result = await postJson<AskResult>('/api/ask', { question: q, at_ms: atMs, subject, lang, ...(onApprove && { studio: true }) });
      setTurns((t) => [{ question: q, result, error: null, atMs }, ...t]);
    } catch (err: unknown) {
      setTurns((t) => [{ question: q, result: null, error: lang === 'ko' ? '답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.' : err instanceof Error ? err.message : 'Could not answer.', atMs }, ...t]);
    } finally {
      setIsBusy(false);
    }
  };
  const handleSubmit = (e: FormEvent) => { e.preventDefault(); void send(question); };

  return (
    <div className="ask">
      <form className="ask-form" onSubmit={handleSubmit}>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={QUESTION_MAX} placeholder={subject ? tr(lang, 'Ask about this…', '이 항목에 관해 물어보세요…') : tr(lang, 'Ask about the match, a player, or a club', '경기·선수·구단에 관해 물어보세요')} aria-label={tr(lang, 'Your question', '질문')} />
        <button type="submit" className="ask-send" disabled={isBusy || !question.trim()} aria-label={tr(lang, 'Ask', '질문하기')}><SendHorizontal size={18} aria-hidden="true" /></button>
      </form>
      <div className="ask-chips">
        {SUGGESTIONS[subject?.kind ?? 'match'][lang].map((s) => <button key={s} type="button" onClick={() => void send(s)} disabled={isBusy}>{s}</button>)}
      </div>
      <ol className="ask-turns" aria-live="polite">
        {turns.map((t, i) => (
          <li key={turns.length - i} className={t.result?.answered === false || t.error ? 'ask-turn ask-unanswered' : 'ask-turn'}>
            <p className="ask-q">{t.question}</p>
            {t.error && <p role="alert">{t.error}</p>}
            {t.result && <p className="ask-a">{t.result.answer}</p>}
            {t.result && t.result.sources.length > 0 && <p className="note">{tr(lang, 'Sources', '출처')}: {t.result.sources.map((s) => sourceLabel(s.label, lang)).join(' · ')}</p>}
            {onApprove && t.result && <AgentSteps agent={t.result.agent} lang={lang} />}
            {onApprove && t.result?.answered && (
              <button type="button" className="link" onClick={() => onApprove({ question: t.question, answer: t.result!.answer, engine: t.result!.engine, atMs: t.atMs })}>{tr(lang, 'Approve for overlay', '화면 그래픽용으로 승인')}</button>
            )}
          </li>
        ))}
      </ol>
      <p className="note">{tr(lang, 'Answers use the fictional world pack and match events up to the current clock.', '가상 세계관 자료와 현재 시간까지의 경기 기록을 근거로 답합니다.')}</p>
    </div>
  );
}
