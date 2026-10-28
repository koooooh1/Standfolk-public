// Client for the Standfolk API envelope: { schema_version, data_version, payload, error }.
export interface Brief { id: string; name: string; native_name?: string | null; number: number; pos: string; nationality: string; pronunciation: string | null; captain: boolean; age: number; season_goals: number; season_apps: number; season_shots: number; season_fouls: number; height_cm: number; value_eur_m: number }
export type Mode = 'fan' | 'broadcast';
export type Lang = 'en' | 'ko';
export type Depth = 'short' | 'detailed';
export interface Prefs { mode: Mode; lang: Lang; depth: Depth }
export interface Standing { position: number; played: number; points: number; won: number; drawn: number; lost: number }
export interface MatchSide { id: string; name: string; short: string; colors: string[]; ground: string; town: string; capacity: number; surface?: string; standing: Standing | null; lineup: { formation: string; starters: Brief[]; bench: Brief[] } }
export interface Result { season: string; matchday: number; home: string; away: string; score: string; outcome: 'W' | 'D' | 'L' }
export interface Streak { id: string; label: string; value: number; unit: string }
export interface Story { title: string; text: string; src: string }
export interface Comparison { points: number; goals_for: number; goals_against: number; clean_sheets: number; played: number; average_age: number; squad_value_eur_m: number }
export type LeaderCategory = 'goals' | 'assists' | 'shots' | 'fouls' | 'value' | 'height';
export interface DemoMatch {
  season: string; matchday: number; kickoff: string; home: MatchSide; away: MatchSide;
  head_to_head: { wins: number; draws: number; losses: number; matches: Result[] };
  insights: Record<string, { comparison: Comparison; streaks: Streak[]; stories: Story[] }>;
  leaders: Record<LeaderCategory, Array<Brief & { value: number }>>;
}

export interface TableRow extends Standing { club: string; name: string; short: string; colors: string[]; gf: number; ga: number; gd: number }
export interface LeagueBasics { name: string; founded: number; clubs: number; matchdays: number; points: { win: number; draw: number; loss: number }; relegated: number; second_tier: string }
export interface LeagueTable { season: string; matchdays_played: number; rows: TableRow[]; basics: LeagueBasics; glossary: Term[]; data_date: string }

export interface NationalTeam { team: string; level: string; caps: number; goals: number; debut: number; status: string }
export interface SeasonRow { season: string; appearances: number; minutes: number | null; goals: number; assists: number; clean_sheets?: number }
export interface PlayerDetail {
  id: string; name: string; number: number; pos: string; detail: string; nationality: string; born: string; age: { years: number; approximate: boolean };
  pronunciation?: string; native_name?: string; name_note?: string; fan_nickname?: string; notes?: string;
  captain_since?: string; vice_captain_since?: string; academy_since?: number; joined: string; from: string; from_name: string | null;
  loans: Array<{ club_name: string | null; season: string }>; home_career?: Array<{ where: string; years: string; apps: number; goals: number }>;
  national_team: NationalTeam | null; country: { background: string } | null; club: { name: string; short: string; colors: string[] };
  seasons: SeasonRow[]; unavailable: Array<{ season: string; reason: string }>;
  summary: { club_totals: { seasons: number; appearances: number; goals: number; assists: number }; current_season: SeasonRow | null; rookie: boolean } | null;
}

export interface Term { term: string; meaning: string; register: 'fan' | 'broadcast' | 'both' }
export interface ClubDetail {
  id: string; name: string; short: string; colors: string[]; ground: string; capacity: number; founded: number; standing: Standing | null;
  content: { nickname: string; pronunciation: string; history: Array<{ year: number; text: string; src: string }>; honours: Array<{ title: string; seasons: string[] }>; culture: Array<{ title: string; text: string; kind: string; src?: string }>; fan_language: Term[] } | null;
  staff: Array<{ id: string; role: string; name: string; pronunciation?: string; since: string }>;
  summary: { last_five: Result[]; finishes: Array<{ season: string; division: string; position: number | null; points: number | null }> } | null;
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `Request failed: ${res.status}`);
  return body.payload as T;
}

export type EventType = 'kickoff' | 'shot' | 'goal' | 'foul' | 'yellow' | 'sub' | 'half_time' | 'full_time';
export interface Buildup { passes: number; progress_m: number; chain: string[] }
export interface Recap { headline: string; summary: string; sources: Array<{ ref: string; label: string }> }
export interface MatchEvent {
  id: string; at_ms: number; minute: number; type: EventType; club: string | null; player: string | null;
  assist?: string; player_off?: string; outcome?: 'saved' | 'off_target' | 'blocked';
  buildup?: Buildup; retracted?: boolean; retracted_reason?: string;
}
// An aired Studio story (docs/schemas/overlay.schema.json).
export interface Overlay { schema_version: '1'; card_id: string; version: number; short: string; long: string; evidence: string[]; valid_from_ms: number; engine: 'template' | 'agents'; synthetic: true }
export interface Snapshot { at_ms: number; minute: number; phase: 'pre' | 'first_half' | 'half_time' | 'second_half' | 'full_time'; score: Record<string, number>; events: MatchEvent[]; duration_ms: number; on_air?: Overlay | null; recap?: Recap | null }

export type AgentOutcome = 'ok' | 'rejected' | 'rejected_by_api' | 'budget_exhausted' | 'timeout' | 'provider_error' | 'no_model';
export interface AgentStep { agent: string; action: string; detail: string; ok: boolean }
export interface AskResult {
  answer: string; answered: boolean; subject: { kind: 'player' | 'club'; id: string } | null; sources: Array<{ label: string; ref: string }>;
  engine: 'template' | 'agents'; agent: { outcome: AgentOutcome; model_calls: number; steps: AgentStep[] } | null;
}

export async function postJson<T>(url: string, data: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `Request failed: ${res.status}`);
  return body.payload as T;
}
