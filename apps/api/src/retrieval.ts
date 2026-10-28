import { DatabaseSync } from 'node:sqlite';
import type { Catalog, Json } from './catalog.js';

// Keyword retrieval for Ask questions the templates cannot answer: the whole world pack is split into short
// passages and indexed in an in-memory SQLite FTS5 table, ranked by BM25.
// A small football thesaurus maps fan wording ("boss", "stadium") to the pack's words, and a word the index does not
// know is corrected to the closest word in the pack ("Vellde" to "Velde"), so neither costs a model call.
// Keep retrieval local and model-call-free; revisit semantic search only if evaluation finds material gaps.
// Match events stay out of the index: live match facts come only from the template engine and the replay clock.
export interface Passage { ref: string; label: string; text: string }

const TEXT_MAX = 2000; // the agent service accepts evidence texts up to 2000 characters
const STOPWORDS = new Set('a an and are as at be by did do does for from has have how i in is it its of on or the their they this to was were what when where which who why will with you your about tell me'.split(' '));

// Fan wording mapped to the words the world pack uses.
const SYNONYMS: Record<string, string[]> = Object.fromEntries(Object.entries({
  'manager': ['coach', 'boss', 'gaffer', 'manages', 'managed', 'managing'],
  'ground': ['stadium', 'arena', 'venue'],
  'champions cup winners': ['trophy', 'trophies', 'title', 'titles', 'won', 'win', 'honours', 'honors'],
  'culture song sings': ['chant', 'chants', 'songs', 'sing', 'singing', 'tradition', 'traditions', 'ritual', 'supporters'],
  'nickname call': ['nicknamed', 'called', 'known'],
  'nationality caps': ['country', 'international', 'national'],
  'joined loan': ['transfer', 'signed', 'signing', 'arrived', 'loaned'],
  'height': ['tall', 'taller'],
  'academy': ['youth', 'youngster'],
  'before': ['previous', 'previously', 'career', 'past'],
  'means language': ['slang', 'term', 'phrase', 'expression', 'mean', 'meaning'],
  'history founded': ['founding', 'origin', 'origins', 'established']
}).flatMap(([targets, words]) => words.map((w) => [w, targets.split(' ')])));

const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 >= 11 && n % 100 <= 13) || n % 10 > 3 ? 0 : n % 10]}`;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const sentences = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export function passages(catalog: Catalog): Passage[] {
  const clubName = (id: unknown) => catalog.league.clubs.find((c) => c.id === id)?.name ?? null;
  const out: Passage[] = [];
  const add = (ref: string, label: string, text: string) => out.push({ ref, label, text: text.slice(0, TEXT_MAX) });
  const { league } = catalog.league;

  add('league', `${league.name as string}: authored league record`, sentences(
    `The ${league.name as string} was founded in ${league.founded as number}.`,
    `It has ${league.clubs_per_season as number} clubs and ${league.matchdays as number} matchdays per season; ${league.relegated_per_season as number} clubs are relegated to the ${league.second_tier as string}.`,
    `The current season is ${league.current_season}.`
  ));

  for (const p of catalog.people.players) {
    const team = p.national_team as { team: string; level: string; caps: number; goals: number; debut: number } | null | undefined;
    const career = (p.home_career as Array<{ where: string; years: string; apps: number; goals: number }> | undefined) ?? [];
    const loans = (p.loans as Array<{ club: string; season: string }> | undefined) ?? [];
    add(`player:${p.id}`, `${p.name}: authored player record`, sentences(
      `${p.name} plays for ${clubName(p.club)}, number ${p.number}, ${p.detail as string} (${p.pos}).`,
      `Nationality: ${p.nationality}. Born ${p.born as string}, age ${(p.age as { years: number }).years}.`,
      p.foot ? `Preferred foot: ${p.foot as string}.` : null,
      p.height_cm ? `Height: ${p.height_cm as number} cm.` : null,
      `Joined in ${p.joined as string}${p.from === 'academy' ? ' from the academy' : clubName(p.from) ? ` from ${clubName(p.from)}` : ''}.`,
      p.captain_since ? `Captain since ${p.captain_since as string}.` : null,
      p.vice_captain_since ? `Vice-captain since ${p.vice_captain_since as string}.` : null,
      p.fan_nickname ? `Fans call ${p.name} "${p.fan_nickname as string}".` : null,
      p.pronunciation ? `Pronounced ${p.pronunciation as string}.` : null,
      p.name_note as string | undefined,
      p.notes as string | undefined,
      ...career.map((c) => `Before the club: ${c.where}, ${c.years}, ${c.apps} appearances, ${c.goals} goals.`),
      ...loans.map((l) => `On loan at ${clubName(l.club)} in ${l.season}.`),
      team ? `${team.team} ${team.level} team: ${team.caps} caps, ${team.goals} goals, debut ${team.debut} (fictional record).` : null
    ));
    const rows = catalog.statistics.player_seasons.filter((s) => s.player === p.id);
    const totals = catalog.statistics.summaries.players[p.id]?.club_totals as { seasons: number; appearances: number; goals: number; assists: number } | undefined;
    if (rows.length) {
      add(`stats:${p.id}`, 'Season statistics (seeded world pack)', sentences(
        `${p.name} league seasons:`,
        ...rows.map((s) => `${s.season}: ${s.appearances as number} appearances, ${s.goals as number} goals, ${s.assists as number} assists.`),
        totals && `Club totals: ${totals.appearances} appearances, ${totals.goals} goals, ${totals.assists} assists in ${totals.seasons} seasons.`
      ));
    }
  }

  for (const s of catalog.people.staff) {
    add(`staff:${s.id as string}`, `${s.name as string}: authored staff record`, sentences(
      `${s.name as string} is the ${s.role} of ${clubName(s.club)} since ${s.since as string}.`,
      s.previous ? `Before that: ${s.previous as string}.` : null,
      `Nationality: ${s.nationality as string}.`,
      s.pronunciation ? `Pronounced ${s.pronunciation as string}.` : null
    ));
  }

  for (const c of catalog.league.clubs) {
    const f = catalog.content.featured[c.id] as (Json & { nickname: string; pronunciation: string; history: Array<{ year: number; text: string }>; honours: Array<{ title: string; seasons: string[] }>; culture: Array<{ title: string; text: string }>; fan_language: Array<{ term: string; meaning: string }> }) | undefined;
    const managers = catalog.content.former_managers.filter((m) => m.club === c.id);
    const finishes = (catalog.statistics.summaries.clubs[c.id]?.finishes as Array<{ season: string; division: string; position: number | null; points: number | null }> | undefined) ?? [];
    const label = `${c.name}: authored club record`;
    add(`club:${c.id}`, label, sentences(
      `${c.name} (${c.short}) are from ${c.town as string}, founded in ${c.founded as number}.`,
      `Ground: ${c.ground as string} (capacity ${c.capacity as number}${c.surface ? `, ${lowerFirst(c.surface as string)}` : ''}).`,
      c.color_name ? `Colours: ${c.color_name as string}.` : null,
      f && `Nickname: ${f.nickname}. Pronounced ${f.pronunciation}.`,
      ...(f?.honours ?? []).map((h) => `${h.title}: ${h.seasons.join(', ')}.`),
      managers.length > 0 && `Former managers: ${managers.map((m) => `${m.name as string} (${m.from as string} to ${m.to as string})`).join(', ')}.`
    ));
    if (finishes.length) add(`club:${c.id}:finishes`, label, `${c.name} league finishes: ${finishes.map((x) => `${x.season} ${x.position ? ordinal(x.position) : 'unknown'} in the ${x.division}${x.points ? ` (${x.points} points)` : ''}`).join('; ')}.`);
    f?.history.forEach((h, i) => add(`club:${c.id}:history:${i}`, `${c.name}: club history`, `${c.name} history, ${h.year}: ${h.text}`));
    f?.culture.forEach((x, i) => add(`club:${c.id}:culture:${i}`, `${c.name}: club culture`, `${c.name} culture, ${x.title}: ${x.text}`));
    if (f?.fan_language.length) add(`club:${c.id}:fan-language`, `${c.name}: fan language`, `${c.name} fan language: ${f.fan_language.map((t) => `"${t.term}" means ${lowerFirst(t.meaning)}`).join(' ')}`);
  }

  catalog.content.league_glossary.forEach((g, i) => add(`glossary:${i}`, 'League glossary', `${g.term as string}: ${g.meaning as string}`));
  for (const [country, info] of Object.entries(catalog.content.countries)) add(`country:${country}`, `${country}: football background`, `${country}: ${info.background as string}`);
  return out;
}

export interface Retriever { search(question: string, k?: number): Passage[] }

// Optimal string alignment distance: edits, with a swap of two neighbouring letters counted as one.
function distance(a: string, b: string): number {
  const d = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const tokens = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

export function createRetriever(catalog: Catalog): Retriever {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE VIRTUAL TABLE passages USING fts5(ref UNINDEXED, text, tokenize = 'porter unicode61 remove_diacritics 2')");
  const all = passages(catalog);
  const byRef = new Map(all.map((p) => [p.ref, p]));
  const insert = db.prepare('INSERT INTO passages (ref, text) VALUES (?, ?)');
  for (const p of all) insert.run(p.ref, p.text);
  const vocabulary = [...new Set(all.flatMap((p) => tokens(p.text)))].filter((w) => w.length >= 4);
  const query = db.prepare('SELECT ref FROM passages WHERE passages MATCH ? ORDER BY bm25(passages) LIMIT ?');
  // Each term is quoted, so FTS5 operators in the question are never interpreted.
  const match = (terms: string[], k: number) => (query.all(terms.map((t) => `"${t}"`).join(' OR '), k) as Array<{ ref: string }>).map((r) => r.ref);
  // Words of five letters or more that the index lacks are corrected by up to one edit (up to two from eight letters).
  const corrected = (word: string) => {
    if (word.length < 5 || /\d/.test(word) || match([word], 1).length) return word;
    const limit = word.length >= 8 ? 2 : 1;
    let best = { word, d: limit + 1 };
    for (const candidate of vocabulary) {
      if (Math.abs(candidate.length - word.length) > limit) continue;
      const d = distance(word, candidate);
      if (d < best.d) best = { word: candidate, d };
    }
    return best.word;
  };
  return {
    search(question, k = 6) {
      const words = [...new Set(tokens(question))].filter((w) => !STOPWORDS.has(w)).map(corrected);
      const terms = [...new Set(words.flatMap((w) => [w, ...(SYNONYMS[w] ?? [])]))];
      return terms.length ? match(terms, k).map((ref) => byRef.get(ref)!) : [];
    }
  };
}
