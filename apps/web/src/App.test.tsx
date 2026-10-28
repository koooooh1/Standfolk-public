import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

const side = (id: string, name: string, player: { id: string; name: string }) => ({
  id, name, short: id.toUpperCase(), colors: ['#138a8a'], standing: null, ground: 'Quayside Park', town: 'Vellmouth', capacity: 31400,
  lineup: { formation: '4-3-3', starters: [{ ...player, number: 27, pos: 'FW', nationality: 'Korea Republic', pronunciation: null, captain: true, age: 28, season_goals: 5, season_apps: 7 }], bench: [] }
});
const demo = { season: '2026-27', matchday: 9, kickoff: '2026-10-24T15:00:00+01:00', home: side('vr', 'Vellmouth Rovers', { id: 'p-go', name: 'Youngho Go' }), away: side('ka', 'Kestrin Athletic', { id: 'p-calado', name: 'Rui Calado' }), head_to_head: { wins: 5, draws: 3, losses: 2, matches: [{ season: '2019-20' }] }, insights: { vr: { streaks: [], stories: [] }, ka: { streaks: [], stories: [] } } };
const player = {
  id: 'p-go', name: 'Youngho Go', number: 27, pos: 'FW', detail: 'Wide forward', nationality: 'Korea Republic', born: '1998-04-02', age: { years: 28, approximate: false }, pronunciation: 'YUNG-hoh GOH', native_name: '고영호',
  joined: '2020-21', from: 'abroad', from_name: null, loans: [], national_team: { team: 'Korea Republic', level: 'senior', caps: 48, goals: 15, debut: 2019, status: 'current' },
  country: { background: 'South Korea reached the World Cup semi-finals in 2002.' }, club: { name: 'Vellmouth Rovers', short: 'VR', colors: [] },
  captain_since: '2025-26', seasons: [], unavailable: [], summary: { club_totals: { seasons: 7, appearances: 190, goals: 74, assists: 25 }, current_season: null, rookie: false }
};
const pre = { at_ms: 0, minute: 0, phase: 'pre', score: { vr: 0, ka: 0 }, events: [], duration_ms: 5_400_000 };
const goal = { id: 'e004', at_ms: 720_000, minute: 12, type: 'goal', club: 'vr', player: 'p-go', assist: 'p-calado' };
const live = { ...pre, at_ms: 1_200_000, minute: 20, phase: 'first_half', score: { vr: 1, ka: 0 }, events: [goal] };
const asked = { answer: 'Say it YUNG-hoh GOH. Native spelling: 고영호.', answered: true, subject: { kind: 'player', id: 'p-go' }, sources: [{ label: 'Youngho Go: authored player record', ref: 'player:p-go' }], engine: 'agents',
  agent: { outcome: 'ok', model_calls: 2, steps: [{ agent: 'writer', action: 'draft', detail: 'Drafted an answer.', ok: true }, { agent: 'reviewer', action: 'review', detail: 'Passed the number and name check; the critic accepted.', ok: true }] } };
const story = { id: 'e004', minute: 12, type: 'goal', short: 'GOAL 12′ · Youngho Go (VR)', long: 'Youngho Go scored for Vellmouth Rovers in the 12th minute.', engine: 'agents', sources: [{ ref: 'event:e004', label: 'Synthetic match event, 12′' }], agent: asked.agent };
// The check endpoint blocks any text with a 9 in it, like the API gate would for a figure the evidence lacks.
const recovery = { agent: { outcome: 'rejected', model_calls: 0, steps: [{ agent: 'reviewer', action: 'review', detail: 'Failed the number and name check: the number 14 is not in the evidence.', ok: false }, { agent: 'fallback', action: 'template', detail: 'The second draft failed review; showing the verified template answer.', ok: false }] } };
const checked = (init?: RequestInit) => (String(init?.body).includes('9') ? { ok: false, problem: 'the figure 9 is not in the evidence' } : { ok: true, problem: null });
// The air endpoint echoes the copy as an overlay card, as the API does after its own check.
const aired = (init?: RequestInit) => ({ schema_version: '1', card_id: 'e004', version: 1, short: story.short, long: JSON.parse(String(init?.body)).text, evidence: ['event:e004'], valid_from_ms: 720_000, engine: 'agents', synthetic: true });
const approved = (init?: RequestInit) => ({ approved: true, version: JSON.parse(String(init?.body)).version });
const table = { season: '2026-27', matchdays_played: 8, rows: [], data_date: '2026-10-01', glossary: [{ term: 'Clean sheet', meaning: 'A match in which a team concedes no goals.', register: 'both' }],
  basics: { name: 'Brenmoor League', founded: 1888, clubs: 20, matchdays: 38, points: { win: 3, draw: 1, loss: 0 }, relegated: 3, second_tier: 'Brenmoor Championship' } };
const route = (snapshot: unknown) => vi.fn(async (url: string, init?: RequestInit) => envelope(
  url.includes('/players/') ? player : url.includes('/league/table') ? table : url.includes('/events') ? snapshot : url.includes('/api/ask') ? asked
    : url.endsWith('/check') ? checked(init) : url.endsWith('/approve') ? approved(init) : url.endsWith('/recovery') ? recovery : url.endsWith('/air') ? aired(init) : url.includes('/api/studio/stories/') ? story : demo));
const envelope = (payload: unknown) => ({ ok: true, json: async () => ({ schema_version: '1', payload, error: null }) });

afterEach(cleanup);
beforeEach(() => {
  window.history.replaceState(null, '', '/?mode=fan');
  window.localStorage.clear();
});

describe('match page', () => {
  it('starts with a workspace choice and keeps Studio out of the Fan experience', async () => {
    window.history.replaceState(null, '', '/');
    vi.stubGlobal('fetch', route(pre));
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Where are you joining from?' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Enter Fan matchday' }));
    expect((await screen.findByRole('tab', { name: 'Watch' })).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Stories' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Players' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Studio' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Story queue' })).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: /Workspace: Fan workspace/ })[0]);
    expect(screen.queryByRole('button', { name: 'Change workspace' })).toBeNull();
    expect(window.location.search).toContain('mode=fan');
  });

  it('opens the Fan and Broadcast workspaces with role-specific player facts', async () => {
    vi.stubGlobal('fetch', route(pre));
    const fan = render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Line-ups' }));
    await userEvent.click(await screen.findByRole('button', { name: /Youngho Go, number 27/ }));
    expect(await screen.findByText('YUNG-hoh GOH')).toBeTruthy();
    expect(screen.getByText(/48 caps, 15 goals/)).toBeTruthy();
    fan.unmount();
    window.history.replaceState(null, '', '/?mode=broadcast');
    render(<App />);
    expect(window.location.search).toContain('mode=broadcast');
    expect((await screen.findByRole('tab', { name: 'Studio' })).getAttribute('aria-selected')).toBe('true');
    await userEvent.click(screen.getByRole('tab', { name: 'Match monitor' }));
    await userEvent.click(await screen.findByRole('button', { name: /Youngho Go, number 27/ }));
    expect(screen.getByText('Captain of Vellmouth Rovers')).toBeTruthy();
    expect(screen.getByText(/190 apps, 74 goals/)).toBeTruthy();
  });

  it('routes Fan stories separately and opens Studio as the Broadcast home', async () => {
    vi.stubGlobal('fetch', route(pre));
    const fan = render(<App />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Stories' }));
    expect(screen.getByRole('tab', { name: 'Stories' }).getAttribute('aria-selected')).toBe('true');
    fan.unmount();
    window.history.replaceState(null, '', '/?mode=broadcast');
    render(<App />);
    expect((await screen.findByRole('region', { name: 'Current audience' })).textContent).toContain('Producer workspace');
    expect((await screen.findByRole('tab', { name: 'Studio' })).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('heading', { name: 'Story queue' })).toBeTruthy();
    await userEvent.click(screen.getByRole('tab', { name: 'Match monitor' }));
    expect(screen.getByRole('button', { name: 'Say it' }).getAttribute('aria-pressed')).toBe('true');
    expect(window.location.search).toContain('mode=broadcast');
  });

  it('opens the Broadcast Studio directly when chosen from the entry screen', async () => {
    window.history.replaceState(null, '', '/');
    vi.stubGlobal('fetch', route(pre));
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Open Broadcast Studio' }));
    expect((await screen.findByRole('tab', { name: 'Studio' })).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('heading', { name: 'Story queue' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Match monitor' })).toBeTruthy();
    expect(window.location.search).toContain('mode=broadcast');
  });

  it('shows the score and key moments from the replay, and a moment opens its player', async () => {
    vi.stubGlobal('fetch', route(live));
    render(<App />);
    expect(await screen.findByText('1 – 0')).toBeTruthy();
    expect(screen.getByText('20′')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Summary' }));
    await userEvent.click(screen.getByRole('button', { name: /Youngho Go VR · Assist Rui Calado/ }));
    expect(await screen.findByText('YUNG-hoh GOH')).toBeTruthy();
  });

  it('shows the story the Studio took to air as a lower-third on Watch', async () => {
    vi.stubGlobal('fetch', route({ ...live, on_air: aired({ body: JSON.stringify({ text: 'Youngho Go opened the scoring.' }) }) }));
    render(<App />);
    expect(await screen.findByText('Youngho Go opened the scoring.', { selector: '.lower-third-long' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'On air' })).toBeTruthy();
  });

  it('explains the league, its words, and the data date under the table', async () => {
    vi.stubGlobal('fetch', route(pre));
    render(<App />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Table' }));
    expect(await screen.findByText('How the Brenmoor League works')).toBeTruthy();
    expect(screen.getByText(/The bottom 3 \(from 18th place down/)).toBeTruthy();
    expect(screen.getByText('Clean sheet')).toBeTruthy();
    expect(screen.getByText(/World data as of 1 October 2026/)).toBeTruthy();
  });

  it('asks about the focused player and shows the answer with its source', async () => {
    const fetch = route(live);
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Line-ups' }));
    await userEvent.click(await screen.findByRole('button', { name: /Youngho Go, number 27/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ask' }));
    await userEvent.click(screen.getByRole('button', { name: 'How do you say the name?' }));
    expect(await screen.findByText(asked.answer)).toBeTruthy();
    expect(screen.getByText(/Sources: Youngho Go: authored player record/)).toBeTruthy();
    const body = JSON.parse(String(fetch.mock.calls.find(([url]) => url.includes('/api/ask'))![1]!.body));
    expect(body).toEqual({ question: 'How do you say the name?', at_ms: 0, subject: { kind: 'player', id: 'p-go' } });
    expect(screen.queryByText(/Drafted an answer/)).toBeNull();
  });

  it('drafts a story for each moment, blocks an unsupported edit, and takes the approved story to air', async () => {
    window.history.replaceState(null, '', '/?mode=broadcast');
    const fetch = route(live);
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Studio' }));
    const copy = await screen.findByLabelText(/Long copy \(agent wording\)/);
    expect(screen.getByRole('button', { name: 'Take to air' })).toHaveProperty('disabled', true);
    await userEvent.clear(copy);
    await userEvent.type(copy, 'Youngho Go scored his 9th goal.');
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveProperty('disabled', true);
    await userEvent.click(screen.getByRole('button', { name: 'Check edit' }));
    expect((await screen.findByRole('alert')).textContent).toContain('the figure 9 is not in the evidence');
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveProperty('disabled', true);
    await userEvent.clear(copy);
    await userEvent.type(copy, 'Youngho Go opened the scoring.');
    await userEvent.click(screen.getByRole('button', { name: 'Check edit' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(screen.getByText(/Approved · v1/)).toBeTruthy();
    const approveBody = JSON.parse(String(fetch.mock.calls.find(([url]) => url.endsWith('/approve'))![1]!.body));
    expect(approveBody).toEqual({ text: 'Youngho Go opened the scoring.', version: 1, engine: 'agents', at_ms: 0 });
    await userEvent.click(screen.getByRole('button', { name: 'Take to air' }));
    expect(JSON.parse(String(fetch.mock.calls.find(([url]) => url.endsWith('/air'))![1]!.body))).toMatchObject({ at_ms: 0, version: 1 });
    expect(await screen.findByText('Youngho Go opened the scoring.', { selector: '.lower-third-long' })).toBeTruthy();
    expect(screen.getByText('GOAL 12′ · Youngho Go (VR)', { selector: '.lower-third-short' })).toBeTruthy();
    expect(screen.getByText(/On air for fans on Watch/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Show recovery (demo)' }));
    expect(await screen.findByText(/Review failed twice; template kept · 0 model calls/)).toBeTruthy();
    expect(screen.getByText(/the number 14 is not in the evidence/)).toBeTruthy();
  });

  it('shows a retracted moment without drafting or exposing review controls', async () => {
    window.history.replaceState(null, '', '/?mode=broadcast');
    const retracted = { ...live, at_ms: 3_300_000, minute: 55, events: [{ ...goal, retracted: true, retracted_at_ms: 3_300_000, retracted_reason: 'Offside in the build-up' }] };
    const fetch = route(retracted);
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    expect(await screen.findByText('Retracted (disallowed)')).toBeTruthy();
    expect(fetch.mock.calls.some(([url]) => url === '/api/studio/stories/e004')).toBe(false);
  });

  it('shows the agent steps in the Studio and puts an approved answer in the overlay preview', async () => {
    window.history.replaceState(null, '', '/?mode=broadcast');
    const fetch = route(live);
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Studio' }));
    const studio = within(screen.getByRole('heading', { name: 'Ask and review' }).closest('section')!);
    await userEvent.click(studio.getByRole('button', { name: 'What is the score?' }));
    expect(await studio.findByText(/Agents answered · 2 model calls/)).toBeTruthy();
    expect(JSON.parse(String(fetch.mock.calls.find(([url]) => url.includes('/api/ask'))![1]!.body)).studio).toBe(true);
    expect(studio.getByText(/Drafted an answer/)).toBeTruthy();
    expect(screen.getByText(/Nothing approved yet/)).toBeTruthy();
    await userEvent.click(studio.getByRole('button', { name: 'Approve for overlay' }));
    expect(screen.queryByText(/Nothing approved yet/)).toBeNull();
    expect(screen.getAllByText(asked.answer)).toHaveLength(2);
    expect(screen.getByText(/Agent wording · Synthetic match/)).toBeTruthy();
  });

  it('shows the error state when the match cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'Server down' } }) })));
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toContain('Server down');
  });

  it('shows build-up chains, retracted goals, the full-time recap, and language and depth preferences', async () => {
    window.history.replaceState(null, '', '/?mode=fan');
    window.localStorage.clear();
    const fullSnap = {
      ...live, at_ms: 5_400_000, minute: 90, phase: 'full_time', score: { vr: 2, ka: 1 },
      events: [
        { ...goal, buildup: { passes: 3, progress_m: 65, chain: ['p-go', 'p-calado'] } },
        { id: 'e020', at_ms: 3_120_000, minute: 52, type: 'goal', club: 'vr', player: 'p-go', retracted: true, retracted_reason: 'Offside in the build-up' }
      ],
      recap: { headline: 'Full-time: Vellmouth Rovers 2 – 1 Kestrin Athletic', summary: 'Goals: Youngho Go 12′. (52′ disallowed for offside).', sources: [] }
    };
    vi.stubGlobal('fetch', route(fullSnap));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Summary' }));
    expect(await screen.findByRole('region', { name: 'Full-time recap' })).toBeTruthy();
    expect(screen.getByText(/3 passes, 65 m/)).toBeTruthy();
    expect(screen.getByText(/Disallowed \(Offside in the build-up\)/)).toBeTruthy();
    await userEvent.click(screen.getAllByRole('button', { name: /Workspace: Fan workspace/ })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Detailed' }));
    expect(screen.getByText(/Youngho Go → Rui Calado/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '한국어' }));
    expect(screen.getByText('주요 장면 (Key moments)')).toBeTruthy();
  });
});
