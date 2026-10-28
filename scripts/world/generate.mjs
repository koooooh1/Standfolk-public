// Generates the fictional league history and player statistics from data/world/authored.json.
// Output is deterministic for a given seed: run `node scripts/world/generate.mjs`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DATE = new Date('2026-10-01T00:00:00Z');

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(rng, lambda) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k += 1; p *= rng(); } while (p > limit);
  return k - 1;
}

export const seasonLabel = (year) => `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
export const seasonYear = (label) => Number(label.slice(0, 4));

// Double round robin by the circle method; the second half mirrors the first with venues swapped.
function roundRobin(ids, rng) {
  const order = [...ids].sort(() => rng() - 0.5);
  const n = order.length;
  const firstHalf = [];
  for (let round = 0; round < n - 1; round += 1) {
    const fixtures = [];
    for (let i = 0; i < n / 2; i += 1) {
      const a = order[i];
      const b = order[n - 1 - i];
      fixtures.push((round + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    firstHalf.push(fixtures);
    order.splice(1, 0, order.pop());
  }
  return [...firstHalf, ...firstHalf.map((round) => round.map(([h, a]) => [a, h]))];
}

function placeDemoFixture(rounds, demo) {
  const half = rounds.length / 2;
  const isPair = ([h, a]) => (h === demo.home && a === demo.away) || (h === demo.away && a === demo.home);
  const found = rounds.findIndex((round, i) => i < half && round.some(isPair));
  if (found < 0) throw new Error(`Demo fixture ${demo.home} v ${demo.away}: both clubs must be in the current top flight. Adjust the seed or strengths.`);
  const target = demo.matchday - 1;
  [rounds[found], rounds[target]] = [rounds[target], rounds[found]];
  [rounds[found + half], rounds[target + half]] = [rounds[target + half], rounds[found + half]];
  if (!rounds[target].some(([h, a]) => h === demo.home && a === demo.away)) {
    const flip = (round) => round.map((f) => (isPair(f) ? [f[1], f[0]] : f));
    rounds[target] = flip(rounds[target]);
    rounds[target + half] = flip(rounds[target + half]);
  }
  return rounds;
}

function buildTable(clubIds, matches, points) {
  const rows = new Map(clubIds.map((id) => [id, { club: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 }]));
  for (const m of matches) {
    const home = rows.get(m.home);
    const away = rows.get(m.away);
    home.played += 1; away.played += 1;
    home.gf += m.hg; home.ga += m.ag; away.gf += m.ag; away.ga += m.hg;
    if (m.hg > m.ag) { home.won += 1; away.lost += 1; } else if (m.hg < m.ag) { away.won += 1; home.lost += 1; } else { home.drawn += 1; away.drawn += 1; }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, gd: r.gf - r.ga, points: r.won * points.win + r.drawn * points.draw + r.lost * points.loss }))
    .sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.club.localeCompare(y.club))
    .map((r, i) => ({ position: i + 1, ...r }));
}

function promote(world, rng, outside, nextSeason) {
  const forced = (world.promotion_overrides[nextSeason] ?? []).filter((id) => outside.includes(id));
  const lockedUntilLater = (id) => Object.entries(world.promotion_overrides).some(([season, ids]) => ids.includes(id) && season > nextSeason);
  const strength = new Map(world.clubs.map((c) => [c.id, c.strength]));
  const ranked = outside
    .filter((id) => !forced.includes(id) && !lockedUntilLater(id))
    .map((id) => ({ id, score: strength.get(id) + (rng() - 0.5) * 0.2 }))
    .sort((a, b) => b.score - a.score)
    .map((c) => c.id);
  return [...forced, ...ranked].slice(0, world.league.relegated_per_season);
}

export function simulateLeague(world) {
  const rng = makeRng(world.meta.seed);
  const { league } = world;
  const pool = world.clubs.map((c) => c.id);
  const base = new Map(world.clubs.map((c) => [c.id, c.strength]));
  let topFlight = [...world.initial_top_flight];
  const seasons = [];
  const last = seasonYear(league.current_season);
  for (let year = seasonYear(league.first_season); year <= last; year += 1) {
    const label = seasonLabel(year);
    const current = year === last;
    const strength = new Map(pool.map((id) => [id, base.get(id) + (rng() - 0.5) * 0.12]));
    let rounds = roundRobin(topFlight, rng);
    if (current) rounds = placeDemoFixture(rounds, league.demo_fixture);
    const played = current ? league.current_matchday - 1 : rounds.length;
    const matches = [];
    rounds.slice(0, played).forEach((round, i) => {
      for (const [home, away] of round) {
        const diff = strength.get(home) - strength.get(away);
        matches.push({ season: label, matchday: i + 1, home, away, hg: poisson(rng, 1.45 * Math.exp(1.3 * diff)), ag: poisson(rng, 1.1 * Math.exp(-1.3 * diff)) });
      }
    });
    const table = buildTable(topFlight, matches, league.points);
    const fixtures = current ? rounds[played].map(([home, away]) => ({ season: label, matchday: played + 1, home, away })) : [];
    const entry = { season: label, clubs: [...topFlight], matchdays_played: played, table, matches, fixtures };
    if (!current) {
      entry.champion = table[0].club;
      entry.relegated = table.slice(-league.relegated_per_season).map((r) => r.club);
      const outside = pool.filter((id) => !topFlight.includes(id));
      entry.promoted_for_next = promote(world, rng, outside, seasonLabel(year + 1));
      topFlight = topFlight.filter((id) => !entry.relegated.includes(id)).concat(entry.promoted_for_next);
    }
    seasons.push(entry);
  }
  return seasons;
}

const seniorSeasonOf = (player) => player.joined_season ?? player.joined;

// Largest-remainder rounding, so the parts always add up to the total.
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => {
    if (left > 0) { out[i] += 1; left -= 1; }
  });
  return out;
}

const APPS_SHARE = { starter: 0.8, rotation: 0.5, squad: 0.25, youth: 0.08 };
const GK_SHARE = { starter: 0.85, rotation: 0.1, squad: 0.05, youth: 0.02 };
const MINUTES_PER_APP = { starter: 80, rotation: 55, squad: 40, youth: 25 };
const GOAL_WEIGHT = { GK: 0, DF: 0.15, MF: 0.5, FW: 1 };
const ASSIST_WEIGHT = { GK: 0.05, DF: 0.5, MF: 1, FW: 0.8 };
const YELLOW_RATE = { GK: 0.03, DF: 0.18, MF: 0.15, FW: 0.08 };
const OUTFIELD_PER_MATCH = 10;
const FOUL_RATE = { GK: 0.05, DF: 1.1, MF: 1.0, FW: 0.8 };
const SHOT_RATE = { GK: 0, DF: 0.35, MF: 0.9, FW: 1.9 };
const VALUE_BY_ROLE = { starter: 18, rotation: 8, squad: 4, youth: 1.5 };

function clubSeasonTotals(season, clubId) {
  const own = season.matches.filter((m) => m.home === clubId || m.away === clubId);
  const forGoals = (m) => (m.home === clubId ? m.hg : m.ag);
  const against = (m) => (m.home === clubId ? m.ag : m.hg);
  return {
    played: own.length,
    gf: own.reduce((s, m) => s + forGoals(m), 0),
    ga: own.reduce((s, m) => s + against(m), 0),
    cleanSheets: own.filter((m) => against(m) === 0).length
  };
}

function availability(player, label) {
  if (label < seniorSeasonOf(player)) return { present: false };
  const loan = (player.loans ?? []).find((l) => l.season === label);
  if (loan) return { present: false, reason: `On loan in ${label}; loan-club statistics are not covered by this pack.` };
  return { present: true };
}

function applyMissing(world, row) {
  const gap = world.missing_stats.find((m) => m.player === row.player && m.season === row.season);
  return gap ? { ...row, [gap.field]: null, missing: { [gap.field]: gap.reason } } : row;
}

function playerSeasonRows(world, season, clubId, rng) {
  const totals = clubSeasonTotals(season, clubId);
  const M = totals.played;
  const squad = world.players.filter((p) => p.club === clubId && availability(p, season.season).present);
  const noise = () => 0.75 + rng() * 0.5;
  const apps = squad.map((p) => Math.min(M, Math.round(M * (p.pos === 'GK' ? GK_SHARE : APPS_SHARE)[p.role] * noise())));
  const outfieldApps = squad.reduce((s, p, i) => s + (p.pos === 'GK' ? 0 : apps[i]), 0);
  const othersApps = Math.max(0, M * OUTFIELD_PER_MATCH - outfieldApps);
  const ownGoals = Math.round(totals.gf * 0.03);
  const scored = totals.gf - ownGoals;
  const goals = allocate(scored, [...squad.map((p, i) => apps[i] * GOAL_WEIGHT[p.pos] * p.finishing * noise()), othersApps * 0.22]);
  const assists = allocate(Math.round(scored * 0.72), [...squad.map((p, i) => apps[i] * ASSIST_WEIGHT[p.pos] * p.creativity * noise()), othersApps * 0.28]);
  const gkIdx = squad.map((p, i) => (p.pos === 'GK' ? i : -1)).filter((i) => i >= 0);
  const gkApps = gkIdx.reduce((s, i) => s + apps[i], 0);
  const sheets = allocate(totals.cleanSheets, [...gkIdx.map((i) => apps[i]), Math.max(0, M - gkApps)]);
  const rows = squad.map((p, i) => {
    const row = {
      player: p.id, club: clubId, season: season.season, competition: 'league',
      appearances: apps[i],
      minutes: p.pos === 'GK' ? apps[i] * 90 : Math.min(apps[i] * 90, Math.round(apps[i] * MINUTES_PER_APP[p.role] * noise())),
      goals: goals[i], assists: assists[i],
      shots: Math.max(goals[i], Math.round(apps[i] * SHOT_RATE[p.pos] * (0.6 + p.finishing) * noise())),
      fouls: Math.round(apps[i] * FOUL_RATE[p.pos] * noise()),
      yellow_cards: Math.round(apps[i] * YELLOW_RATE[p.pos] * noise()),
      red_cards: rng() < apps[i] * 0.004 ? 1 : 0
    };
    if (p.pos === 'GK') row.clean_sheets = sheets[gkIdx.indexOf(i)];
    return applyMissing(world, row);
  });
  const others = { label: 'Players not in this pack', goals: goals[squad.length], assists: assists[squad.length], clean_sheets: sheets[gkIdx.length] };
  return { rows, clubRow: { club: clubId, season: season.season, played: M, goals_for: totals.gf, goals_against: totals.ga, clean_sheets: totals.cleanSheets, own_goals_for: ownGoals, others } };
}

export function buildStatistics(world, seasons) {
  const rng = makeRng(world.meta.seed + 1);
  const featured = world.clubs.filter((c) => c.featured).map((c) => c.id);
  const player_seasons = [];
  const club_seasons = [];
  const unavailable = [];
  for (const season of seasons) {
    for (const clubId of featured) {
      if (season.clubs.includes(clubId)) {
        const { rows, clubRow } = playerSeasonRows(world, season, clubId, rng);
        player_seasons.push(...rows);
        club_seasons.push(clubRow);
        continue;
      }
      world.players.filter((p) => p.club === clubId && availability(p, season.season).present)
        .forEach((p) => unavailable.push({ player: p.id, season: season.season, reason: `${season.season} was a ${world.league.second_tier} season; second-tier statistics are not covered by this pack.` }));
    }
    for (const p of world.players) {
      const a = availability(p, season.season);
      if (a.reason) unavailable.push({ player: p.id, season: season.season, reason: a.reason });
    }
  }
  return { player_seasons, club_seasons, unavailable };
}

// Fictional estimated value in millions of euros: role, quality, and age; rounded to 0.5m.
export function marketValue(player, rng) {
  const years = ageOn(player.born).years;
  const ageFactor = years <= 20 ? 0.8 : years <= 28 ? 1.15 - Math.abs(years - 25) * 0.04 : Math.max(0.25, 1 - (years - 28) * 0.12);
  const quality = 0.6 + Math.max(player.finishing, player.creativity) * 0.8 + (player.pos === 'GK' ? 0.4 : 0);
  return Math.max(0.5, Math.round(VALUE_BY_ROLE[player.role] * ageFactor * quality * (0.85 + rng() * 0.3) * 2) / 2);
}

export function ageOn(born, date = DATA_DATE) {
  if (/^\d{4}$/.test(born)) return { years: date.getUTCFullYear() - Number(born) - 1, approximate: true };
  const b = new Date(`${born}T00:00:00Z`);
  const beforeBirthday = date.getUTCMonth() < b.getUTCMonth() || (date.getUTCMonth() === b.getUTCMonth() && date.getUTCDate() < b.getUTCDate());
  return { years: date.getUTCFullYear() - b.getUTCFullYear() - (beforeBirthday ? 1 : 0), approximate: false };
}

function resultFor(m, clubId) {
  const forGoals = m.home === clubId ? m.hg : m.ag;
  const against = m.home === clubId ? m.ag : m.hg;
  return { season: m.season, matchday: m.matchday, home: m.home, away: m.away, score: `${m.hg}-${m.ag}`, outcome: forGoals > against ? 'W' : forGoals < against ? 'L' : 'D' };
}

function clubSummary(world, seasons, stats, id) {
  const all = seasons.flatMap((s) => s.matches);
  const finishes = seasons.map((s) => {
    const row = s.table.find((r) => r.club === id);
    return { season: s.season, division: row ? world.league.name : world.league.second_tier, position: row?.position ?? null, points: row?.points ?? null, complete: s.matchdays_played === world.league.matchdays };
  });
  const top_scorer_by_season = {};
  for (const r of stats.player_seasons.filter((x) => x.club === id)) {
    if (!top_scorer_by_season[r.season] || r.goals > top_scorer_by_season[r.season].goals) top_scorer_by_season[r.season] = { player: r.player, goals: r.goals };
  }
  return { finishes, last_five: all.filter((m) => m.home === id || m.away === id).slice(-5).map((m) => resultFor(m, id)), top_scorer_by_season };
}

export function buildSummaries(world, seasons, stats) {
  const featured = world.clubs.filter((c) => c.featured).map((c) => c.id);
  const [a, b] = featured;
  const derby = seasons.flatMap((s) => s.matches).filter((m) => (m.home === a && m.away === b) || (m.home === b && m.away === a)).map((m) => resultFor(m, a));
  const count = (o) => derby.filter((m) => m.outcome === o).length;
  const lastSeason = seasonLabel(seasonYear(world.league.current_season) - 1);
  const players = Object.fromEntries(world.players.map((p) => {
    const rows = stats.player_seasons.filter((r) => r.player === p.id);
    const sum = (k) => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
    return [p.id, {
      club_totals: { seasons: rows.length, appearances: sum('appearances'), goals: sum('goals'), assists: sum('assists') },
      current_season: rows.find((r) => r.season === world.league.current_season) ?? null,
      rookie: seniorSeasonOf(p) >= lastSeason
    }];
  }));
  return {
    clubs: Object.fromEntries(featured.map((id) => [id, clubSummary(world, seasons, stats, id)])),
    head_to_head: { clubs: [a, b], record_from: a, wins: count('W'), draws: count('D'), losses: count('L'), matches: derby },
    players
  };
}

// Priority 1 is who the demo shows most: managers, regular starters, and featured players.
const isPriority = (p) => p.role === 'Manager' || p.role === 'starter' || p.featured === true;

function facePrompts(world) {
  const people = [...world.staff.map((s) => ({ ...s, kind: 'staff' })), ...world.players.map((p) => ({ ...p, kind: 'player' }))];
  const first = people.filter(isPriority);
  const rest = people.filter((p) => !isPriority(p));
  const lines = ['# Face prompts for the fictional world', '',
    'Generated by `scripts/world/generate.mjs`. Every person is fictional. Generate one square image per person (at least 512 × 512, WebP or PNG) and save it at the listed path. Never use a real person as a reference.', '',
    `${people.length} people in total: ${world.players.length} players and ${world.staff.length} staff. Priority 1 (${first.length}: managers, regular starters, featured players) is enough for the demo; priority 2 (${rest.length}) fills the squads.`, ''];
  for (const [title, group] of [['Priority 1', first], ['Priority 2', rest]]) {
    lines.push(`# ${title}`, '');
    group.forEach((p) => lines.push(...promptFor(world, p)));
  }
  return lines.join('\n');
}

function promptFor(world, p) {
  const club = world.clubs.find((c) => c.id === p.club);
  const role = p.kind === 'staff' ? `${p.role.toLowerCase()} at a fictional football club` : `professional footballer (${p.detail.toLowerCase()})`;
  const top = p.kind === 'staff' ? 'club jacket' : 'training top';
  return [`## ${p.name} (${p.id}), ${club.name}`, '', `File: \`data/catalog/media/people/${p.id}.webp\``, '',
    `> Head-and-shoulders portrait of a fictional ${role}, about ${ageOn(p.born).years} years old, ${p.appearance}. Wearing a plain ${club.color_name ?? 'dark'} ${top} with no logo, badge, sponsor, or text. Neutral light-grey studio background, soft even light, photorealistic, looking at the camera. Must not resemble any real person.`, ''];
}

export function generate(world) {
  const valueRng = makeRng(world.meta.seed + 2);
  const seasons = simulateLeague(world);
  const stats = buildStatistics(world, seasons);
  const featured = new Set(world.clubs.filter((c) => c.featured).map((c) => c.id));
  return {
    league: {
      meta: world.meta, league: world.league, clubs: world.clubs.map(({ strength, ...c }) => c),
      seasons: seasons.map(({ matches, ...s }) => ({ ...s, featured_matches: matches.filter((m) => featured.has(m.home) || featured.has(m.away)) }))
    },
    people: {
      meta: world.meta,
      staff: world.staff.map((s) => ({ ...s, age: ageOn(s.born), image: `media/people/${s.id}.webp` })),
      players: world.players.map(({ finishing, creativity, ...p }) => ({ ...p, age: ageOn(p.born), market_value_eur_m: marketValue({ ...p, finishing, creativity }, valueRng), image: `media/people/${p.id}.webp` }))
    },
    statistics: { meta: world.meta, ...stats, summaries: buildSummaries(world, seasons, stats) },
    content: { meta: world.meta, featured: world.featured, league_glossary: world.league_glossary, former_managers: world.former_managers, countries: world.countries },
    facePrompts: facePrompts(world),
    seasons
  };
}

function writeFile(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const world = JSON.parse(readFileSync(join(ROOT, 'data/world/authored.json'), 'utf8'));
  const out = generate(world);
  for (const name of ['league', 'people', 'statistics', 'content']) {
    writeFile(join(ROOT, `data/catalog/${name}.json`), `${JSON.stringify(out[name], null, 2)}\n`);
  }
  writeFile(join(ROOT, 'docs/world/face-prompts.md'), `${out.facePrompts}\n`);
  process.stdout.write('Wrote data/catalog/{league,people,statistics,content}.json and docs/world/face-prompts.md\n');
}
