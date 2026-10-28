import { randomUUID } from 'node:crypto';
import type { AskLanguage, AskResult } from './ask.js';
import type { Passage } from './retrieval.js';

export const MAX_MODEL_CALLS = 4;
// Without the critic a run is a draft and at most one rewrite.
export const WRITER_ONLY_CALLS = 2;
export const AGENT_TIMEOUT_MS = 15_000;
// The API gives up shortly after the service's own deadline, so the service can still answer with outcome "timeout".
const TIMEOUT_GRACE_MS = 2_000;
const OUTCOMES = ['ok', 'rejected', 'budget_exhausted', 'timeout', 'provider_error', 'no_model'] as const;

export type AgentOutcome = (typeof OUTCOMES)[number];
export interface AgentStep { agent: string; action: string; detail: string; ok: boolean }
export interface AgentRequest {
  request_id: string;
  question: string;
  answer_language: AskLanguage;
  template_answer: string;
  evidence: Array<{ ref: string; label: string; text: string }>;
  max_model_calls: number;
  timeout_ms: number;
  grounding: 'template' | 'evidence';
  critic: boolean;
  scripted_drafts?: string[];
}
export interface AgentResult {
  request_id: string;
  answer: string;
  engine: 'agents' | 'template';
  outcome: AgentOutcome;
  model_calls: number;
  steps: AgentStep[];
}
// What the Ask response shows of an agent run. 'rejected_by_api' means the API gate refused an answer the service wrote.
export interface AgentSummary { outcome: AgentOutcome | 'rejected_by_api'; model_calls: number; steps: AgentStep[] }

// Rewording (no passages): the agents may only restate the template answer; each source's text is its label.
// Answering (passages from the world-pack index): numbers and names may come from those passages.
export function agentRequest(question: string, template: AskResult, { critic, passages, answerLanguage = 'en' }: { critic: boolean; passages?: Passage[]; answerLanguage?: AskLanguage }): AgentRequest {
  const evidence = passages ?? template.sources.map((s) => ({ ref: s.ref, label: s.label, text: s.label }));
  return {
    request_id: randomUUID(),
    question,
    answer_language: answerLanguage,
    template_answer: template.answer,
    evidence,
    max_model_calls: critic ? MAX_MODEL_CALLS : WRITER_ONLY_CALLS,
    timeout_ms: AGENT_TIMEOUT_MS,
    grounding: passages ? 'evidence' : 'template',
    critic
  };
}

// Any network, HTTP, timeout, or shape error returns null, and the caller keeps the template answer.
export async function askAgents(url: string, payload: AgentRequest, fetchImpl: typeof fetch = fetch): Promise<AgentResult | null> {
  try {
    const res = await fetchImpl(`${url}/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(payload.timeout_ms + TIMEOUT_GRACE_MS)
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return isAgentResult(body, payload.request_id) ? body : null;
  } catch {
    return null;
  }
}

// Defaults stay well below Google AI Studio's free-tier quota; set the real numbers through the environment.
export const DAILY_MODEL_CALLS = 40;
export const CONCURRENT_RUNS = 2;
// Google resets daily quotas at midnight Pacific time, so this budget does too.
const pacificDay = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

export interface AgentLimits { dailyModelCalls?: number; concurrentRuns?: number; now?: () => Date }
export type LimitedCall = (payload: AgentRequest, call: () => Promise<AgentResult | null>) => Promise<AgentResult | null>;

// A run reserves its worst case (max_model_calls) before it starts and gives back what it did not use.
// A run over either limit never reaches the service and reports budget_exhausted.
// shortcut: counts live in this process, so a restart resets them and each replica has its own; run one API replica.
export function createAgentLimiter({ dailyModelCalls = DAILY_MODEL_CALLS, concurrentRuns = CONCURRENT_RUNS, now = () => new Date() }: AgentLimits = {}): LimitedCall {
  let day = '';
  let used = 0;
  let running = 0;
  return async (payload, call) => {
    const today = pacificDay(now());
    if (today !== day) { day = today; used = 0; }
    const reserved = payload.max_model_calls;
    if (running >= concurrentRuns || used + reserved > dailyModelCalls) {
      return { request_id: payload.request_id, answer: payload.template_answer, engine: 'template', outcome: 'budget_exhausted', model_calls: 0, steps: [] };
    }
    running += 1;
    used += reserved;
    try {
      const result = await call();
      // No result means the spend is unknown, so the whole reservation stays used.
      if (result && day === today) used -= reserved - Math.min(result.model_calls, reserved);
      return result;
    } finally {
      running -= 1;
    }
  };
}

// API gate: the agent answer replaces the template only when the service wrote it with outcome ok and every figure,
// number word, and name in it appears in what the API sent as its grounding: the template answer, or the retrieved passages.
export function gateAgentResult(template: AskResult, agent: AgentResult | null, request?: AgentRequest): AskResult & { agent: AgentSummary | null } {
  if (!agent || !request) return { ...template, agent: null };
  const summary = { outcome: agent.outcome, model_calls: agent.model_calls, steps: agent.steps };
  if (agent.engine !== 'agents' || agent.outcome !== 'ok') return { ...template, agent: summary };
  const answering = request.grounding === 'evidence';
  const allowed = answering ? request.evidence.map((e) => e.text).join('\n') : template.answer;
  if (unsupportedClaim(agent.answer, allowed, request.answer_language) !== null) return { ...template, agent: { ...summary, outcome: 'rejected_by_api' } };
  const sources = answering ? usedPassages(agent.answer, request.evidence) : template.sources;
  return { ...template, answer: agent.answer, answered: true, sources, engine: 'agents', agent: summary };
}

// A figure is a digit run; thousands separators are ignored, so "31,400" and "31400" are the same figure.
const figures = (text: string) => (text.match(/\d+(?:,\d{3})*(?!\d)/g) ?? []).map((f) => f.replaceAll(',', ''));
// Spelled-out figures and mid-sentence capitalised words (names) must also appear in the grounding.
const NUMBER_WORDS = new Set('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty hundred thousand once twice thrice first second third fourth fifth sixth seventh eighth ninth tenth dozen'.split(' '));
const NUMBER_WORDS_KO = new Set('한 두 세 네 다섯 여섯 일곱 여덟 아홉 열 열한 열두 열세 열네 열다섯 열여섯 열일곱 열여덟 열아홉 스물 스무 서른 마흔 쉰 예순 일흔 여든 아흔 하나 둘 셋 넷 첫 첫째 둘째 셋째 넷째'.split(' '));
const wordsOf = (text: string) => [...text.matchAll(/\p{L}+(?:['’-]\p{L}+)*/gu)].map((m) => ({ word: m[0].replace(/['’]s$/u, ''), start: /(^|[.!?:]\s*)$/u.test(text.slice(0, m.index)) }));

// The gate check: why a text is not supported by its grounding, or null when every figure, number word, and name is.
export function unsupportedClaim(text: string, grounding: string, lang: AskLanguage = 'en'): string | null {
  if (!text.trim()) return 'the text is empty';
  const allowedFigures = new Set(figures(grounding));
  const figure = figures(text).find((f) => !allowedFigures.has(f));
  if (figure !== undefined) return `the figure ${figure} is not in the evidence`;
  const known = new Set(wordsOf(grounding).map((w) => w.word.toLowerCase()));
  for (const { word, start } of wordsOf(text)) {
    const lower = word.toLowerCase();
    if (NUMBER_WORDS.has(lower) && !known.has(lower)) return `the number word "${word}" is not in the evidence`;
    if (lang === 'ko' && NUMBER_WORDS_KO.has(lower) && !known.has(lower)) return `the Korean number word "${word}" is not in the evidence`;
    if (!NUMBER_WORDS.has(lower) && !start && word[0] !== word[0].toLowerCase() && !known.has(lower)) return `the name "${word}" is not in the evidence`;
  }
  return null;
}

// Sources of an answer from passages: those sharing at least two words of five letters or more with it,
// so retrieved passages the writer did not use are not listed. The top passage stands in if none qualifies.
const longWords = (text: string) => new Set(wordsOf(text).map((w) => w.word.toLowerCase()).filter((w) => w.length >= 5));
function usedPassages(answer: string, evidence: AgentRequest['evidence']): AskResult['sources'] {
  const said = longWords(answer);
  const used = evidence.filter((e) => [...longWords(e.text)].filter((w) => said.has(w)).length >= 2);
  return (used.length ? used : evidence.slice(0, 1)).map(({ ref, label }) => ({ ref, label }));
}

const isRecord =(value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isStep = (value: unknown): value is AgentStep => isRecord(value) && typeof value.agent === 'string' && typeof value.action === 'string' && typeof value.detail === 'string' && typeof value.ok === 'boolean';
function isAgentResult(value: unknown, requestId: string): value is AgentResult {
  return isRecord(value) && value.request_id === requestId && typeof value.answer === 'string' && (value.engine === 'agents' || value.engine === 'template')
    && OUTCOMES.some((o) => o === value.outcome) && Number.isInteger(value.model_calls) && Array.isArray(value.steps) && value.steps.every(isStep);
}
