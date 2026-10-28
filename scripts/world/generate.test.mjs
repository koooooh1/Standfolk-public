import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate, allocate } from './generate.mjs';

const world = JSON.parse(readFileSync(new URL('../../data/world/authored.json', import.meta.url), 'utf8'));
const out = generate(world);
const { seasons } = out;
const stats = out.statistics;

test('same seed gives the same world', () => {
  assert.deepEqual(generate(world).statistics, stats);
});

test('allocate always sums to the total', () => {
  assert.equal(allocate(17, [0.3, 1.2, 0.01, 2]).reduce((a, b) => a + b, 0), 17);
  assert.deepEqual(allocate(5, [0, 0]), [0, 0]);
});

test('every season has 20 clubs and a consistent table', () => {
  for (const s of seasons) {
    assert.equal(new Set(s.clubs).size, 20, s.season);
    assert.equal(s.table.length, 20);
    const gf = s.table.reduce((a, r) => a + r.gf, 0);
    const ga = s.table.reduce((a, r) => a + r.ga, 0);
    assert.equal(gf, ga, `${s.season} goals for and against`);
    for (const r of s.table) {
      assert.equal(r.points, r.won * 3 + r.drawn, `${s.season} ${r.club} points`);
      assert.equal(r.played, r.won + r.drawn + r.lost);
      assert.equal(r.played, s.matchdays_played);
    }
  }
});

test('relegated clubs leave and promoted clubs arrive', () => {
  for (let i = 0; i < seasons.length - 1; i += 1) {
    const s = seasons[i];
    const next = seasons[i + 1];
    assert.equal(s.relegated.length, 3);
    s.relegated.forEach((id) => assert.ok(!next.clubs.includes(id), `${id} stays down after ${s.season}`));
    s.promoted_for_next.forEach((id) => assert.ok(next.clubs.includes(id), `${id} goes up after ${s.season}`));
  }
});

test('the demo fixture is matchday 9, Vellmouth at home to Kestrin, and not yet played', () => {
  const current = seasons.at(-1);
  assert.equal(current.season, '2026-27');
  assert.equal(current.matchdays_played, 8);
  assert.ok(current.fixtures.some((f) => f.matchday === 9 && f.home === 'vr' && f.away === 'ka'));
  assert.ok(!current.matches.some((m) => m.matchday === 9));
});

test('player goals, assists, and clean sheets add up to the club totals', () => {
  for (const c of stats.club_seasons) {
    const rows = stats.player_seasons.filter((r) => r.club === c.club && r.season === c.season);
    const sum = (k) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
    assert.equal(sum('goals') + c.others.goals + c.own_goals_for, c.goals_for, `${c.club} ${c.season} goals`);
    assert.equal(sum('assists') + c.others.assists, Math.round((c.goals_for - c.own_goals_for) * 0.72), `${c.club} ${c.season} assists`);
    assert.equal(sum('clean_sheets') + c.others.clean_sheets, c.clean_sheets, `${c.club} ${c.season} clean sheets`);
    for (const r of rows) {
      assert.ok(r.appearances <= c.played);
      if (r.minutes !== null) assert.ok(r.minutes <= r.appearances * 90);
    }
  }
});

test('each featured club has 25 players in a 3-8-8-6 shape and five staff', () => {
  for (const club of ['vr', 'ka']) {
    const squad = world.players.filter((p) => p.club === club);
    assert.equal(squad.length, 25);
    const count = (pos) => squad.filter((p) => p.pos === pos).length;
    assert.deepEqual([count('GK'), count('DF'), count('MF'), count('FW')], [3, 8, 8, 6]);
    assert.equal(new Set(squad.map((p) => p.number)).size, 25, `${club} shirt numbers`);
    const staff = world.staff.filter((s) => s.club === club);
    assert.equal(staff.length, 5);
    assert.equal(staff.filter((s) => s.role === 'Manager').length, 1);
  }
  assert.equal(new Set(world.players.map((p) => p.name)).size, world.players.length);
});

test('year-only dates stay year-only and ages say they are approximate', () => {
  const varga = out.people.players.find((p) => p.id === 'p-varga');
  assert.equal(varga.born, '1997');
  assert.equal(varga.age.approximate, true);
});

test('a missing statistic is null with a reason, never zero', () => {
  const row = stats.player_seasons.find((r) => r.player === 'p-halvik' && r.season === '2017-18');
  assert.equal(row.minutes, null);
  assert.match(row.missing.minutes, /not kept/);
});

test('loan and second-tier seasons have no statistics, only a reason', () => {
  assert.ok(!stats.player_seasons.some((r) => r.player === 'p-ebbe' && r.season === '2024-25'));
  assert.ok(stats.unavailable.some((u) => u.player === 'p-ebbe' && u.season === '2024-25' && /loan/i.test(u.reason)));
  assert.ok(stats.unavailable.some((u) => u.player === 'p-calado' && u.season === '2024-25' && /second-tier/.test(u.reason)));
});

test('every nationality has a football background that names no real league', () => {
  const realLeagues = /premier league|la liga|bundesliga|serie a|ligue 1|eredivisie|j1|j\.league|mls|allsvenskan|eliteserien|superliga/i;
  for (const p of [...world.players, ...world.staff]) assert.ok(world.countries[p.nationality], p.nationality);
  for (const [name, c] of Object.entries(world.countries)) assert.doesNotMatch(c.background, realLeagues, name);
  for (const p of world.players) for (const h of p.home_career ?? []) assert.doesNotMatch(h.where, realLeagues, p.id);
});

test('non-Latin and family-first names carry a native form and a pronunciation', () => {
  for (const id of ['p-nakase', 'p-go', 'p-rosk', 'p-haddou', 'p-varga']) {
    const p = world.players.find((x) => x.id === id);
    assert.ok(p.native_name, id);
    assert.ok(p.pronunciation, id);
  }
  for (const p of world.players.filter((x) => world.countries[x.nationality].name_order === 'family-first')) assert.ok(p.name_note, p.id);
});

test('national-team records are complete or explicitly null', () => {
  for (const p of world.players) {
    assert.ok('national_team' in p, p.id);
    if (p.national_team) for (const k of ['team', 'level', 'caps', 'goals', 'debut', 'status']) assert.ok(k in p.national_team, `${p.id} ${k}`);
  }
});

test('the face prompts cover every person and forbid real likenesses', () => {
  for (const p of [...world.staff, ...world.players]) assert.ok(out.facePrompts.includes(`(${p.id})`), p.id);
  assert.ok(!out.facePrompts.includes('undefined'));
  assert.match(out.facePrompts, /Must not resemble any real person/);
});

test('shots never fall below goals, fouls are counts, and every player has a fictional value', () => {
  for (const r of stats.player_seasons) {
    assert.ok(r.shots >= r.goals, `${r.player} ${r.season} shots`);
    assert.ok(Number.isInteger(r.fouls) && r.fouls >= 0);
  }
  for (const p of out.people.players) assert.ok(p.market_value_eur_m >= 0.5 && p.market_value_eur_m <= 60, `${p.id} value ${p.market_value_eur_m}`);
});
