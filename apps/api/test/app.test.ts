import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { loadCatalog } from '../src/catalog.js';

const catalog = loadCatalog(fileURLToPath(new URL('../../../data/catalog', import.meta.url)));
const app = buildApp(catalog);
const get = async (url: string) => {
  const res = await app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() };
};

describe('catalog API', () => {
  it('reports health in the envelope', async () => {
    const { status, body } = await get('/api/health');
    expect(status).toBe(200);
    expect(body).toMatchObject({ schema_version: '1', payload: { status: 'ok' }, error: null });
  });

  it('serves the demo fixture with two 4-3-3 line-ups and the captain', async () => {
    const { body } = await get('/api/match/demo');
    const { home, away, matchday, synthetic } = body.payload;
    expect([home.id, away.id, matchday, synthetic]).toEqual(['vr', 'ka', 9, true]);
    for (const side of [home, away]) {
      expect(side.lineup.starters).toHaveLength(11);
      expect(new Set(side.lineup.starters.map((p: { id: string }) => p.id)).size).toBe(11);
    }
    expect(home.lineup.starters.find((p: { id: string }) => p.id === 'p-go').captain).toBe(true);
    expect(home.lineup.bench.map((p: { id: string }) => p.id)).toContain('p-ebbe');
    const go = home.lineup.starters.find((p: { id: string }) => p.id === 'p-go');
    const line = catalog.statistics.summaries.players['p-go'].current_season as { goals: number; appearances: number };
    expect(go).toMatchObject({ age: 28, season_goals: line.goals, season_apps: line.appearances });
    expect(body.payload.kickoff).toBe('2026-10-24T15:00:00+01:00');
    expect(go).toMatchObject({ height_cm: 179, value_eur_m: expect.any(Number), season_shots: expect.any(Number) });
    const vr = body.payload.insights.vr;
    expect(vr.comparison.points).toBe(home.standing.points);
    expect(vr.streaks.map((s: { id: string }) => s.id)).toEqual(['unbeaten', 'wins', 'scoring', 'clean', 'over']);
    expect(vr.stories.length).toBeGreaterThan(0);
    const top = body.payload.leaders.goals;
    expect(top).toHaveLength(5);
    expect(top[0].value).toBeGreaterThanOrEqual(top[4].value);
  });

  it('serves the current league table with club names', async () => {
    const { body } = await get('/api/league/table');
    expect(body.payload.rows).toHaveLength(20);
    expect(body.payload.rows[0].position).toBe(1);
    expect(body.payload.rows.find((r: { club: string }) => r.club === 'vr')).toMatchObject({ name: 'Vellmouth Rovers', position: 2 });
  });

  it('serves league basics, the glossary, and the data date with the table', async () => {
    const { body } = await get('/api/league/table');
    expect(body.payload.basics).toMatchObject({ name: 'Brenmoor League', founded: 1888, clubs: 20, matchdays: 38, points: { win: 3, draw: 1, loss: 0 }, relegated: 3, second_tier: 'Brenmoor Championship' });
    expect(body.payload.glossary).toContainEqual({ term: 'Clean sheet', meaning: 'A match in which a team concedes no goals.', register: 'both' });
    expect(body.payload.data_date).toBe('2026-10-01');
  });

  it('returns a player with pronunciation, country background, and statistics', async () => {
    const { body } = await get('/api/players/p-go');
    expect(body.payload).toMatchObject({ name: 'Youngho Go', native_name: '고영호', pronunciation: 'YUNG-hoh GOH' });
    expect(body.payload.country.background).toMatch(/2002/);
    expect(body.payload.seasons.length).toBeGreaterThan(0);
  });

  it('returns a club with fan content, staff, and its summary', async () => {
    const { body } = await get('/api/clubs/vr');
    expect(body.payload.content.nickname).toBe('The Ferrymen');
    expect(body.payload.staff).toHaveLength(5);
    expect(body.payload.summary.last_five).toHaveLength(5);
  });

  it('serves media only by known kind and plain file name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'media-'));
    mkdirSync(join(dir, 'people'));
    writeFileSync(join(dir, 'people', 'p-go.webp'), 'webp-bytes');
    const media = buildApp(catalog, dir);
    const ok = await media.inject({ method: 'GET', url: '/api/media/people/p-go.webp' });
    expect([ok.statusCode, ok.headers['content-type'], ok.body]).toEqual([200, 'image/webp', 'webp-bytes']);
    for (const url of ['/api/media/people/..%2Fapp.ts', '/api/media/people/p-go.png', '/api/media/people/missing.webp', '/api/media/secrets/p-go.webp', '/api/media/crests/p-go.webp']) {
      expect((await media.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
  });

  it('serves the built dashboard, falls back to index.html for app paths, and never leaves the web folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<html>app</html>');
    writeFileSync(join(dir, 'assets', 'app-1.js'), 'js');
    const site = buildApp(catalog, undefined, {}, { webDir: dir });
    const page = await site.inject({ method: 'GET', url: '/' });
    expect([page.statusCode, page.headers['content-type'], page.headers['cache-control'], page.body]).toEqual([200, 'text/html; charset=utf-8', 'no-cache', '<html>app</html>']);
    const asset = await site.inject({ method: 'GET', url: '/assets/app-1.js' });
    expect([asset.statusCode, asset.headers['cache-control']]).toEqual([200, 'public, max-age=31536000, immutable']);
    expect((await site.inject({ method: 'GET', url: '/studio' })).body).toBe('<html>app</html>');
    for (const url of ['/..%2F..%2Fpackage.json', '/%2e%2e/%2e%2e/package.json', '/missing.js', '/api/nothing']) {
      expect((await site.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
    expect((await site.inject({ method: 'GET', url: '/%E0%A4%A' })).statusCode).toBe(400);
    expect((await site.inject({ method: 'GET', url: '/api/health' })).json().payload).toEqual({ status: 'ok' });
  });

  it('limits POST requests per client and minute when a limit is set', async () => {
    const limited = buildApp(catalog, undefined, {}, { requestsPerMinute: 2 });
    const ask = () => limited.inject({ method: 'POST', url: '/api/ask', payload: { question: 'What is the score?' } });
    expect([(await ask()).statusCode, (await ask()).statusCode]).toEqual([200, 200]);
    const third = await ask();
    expect([third.statusCode, third.headers['retry-after']]).toEqual([429, '60']);
    expect(third.json()).toMatchObject({ payload: null, error: { code: 'rate_limited' } });
    expect((await limited.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });

  it('serves the authored club crests as SVG', async () => {
    const media = buildApp(catalog, fileURLToPath(new URL('../../../data/catalog/media', import.meta.url)));
    const res = await media.inject({ method: 'GET', url: '/api/media/crests/vr.svg' });
    expect([res.statusCode, res.headers['content-type']]).toEqual([200, 'image/svg+xml']);
    expect(res.body).toContain('Vellmouth Rovers crest');
  });

  it('serves generated WebP crests with their own content type', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-media-'));
    mkdirSync(join(dir, 'crests'));
    writeFileSync(join(dir, 'crests', 'gry.webp'), 'RIFF');
    const res = await buildApp(catalog, dir).inject({ method: 'GET', url: '/api/media/crests/gry.webp' });
    expect([res.statusCode, res.headers['content-type']]).toEqual([200, 'image/webp']);
  });

  it('answers 404 in the envelope for unknown ids', async () => {
    const { status, body } = await get('/api/players/p-nobody');
    expect(status).toBe(404);
    expect(body).toMatchObject({ payload: null, error: { code: 'not_found' } });
  });
});
