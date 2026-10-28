import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The catalog is the generated fictional world in data/catalog (see docs/world/README.md).
export type Json = Record<string, unknown>;

export interface Player extends Json {
  id: string;
  club: string;
  name: string;
  number: number;
  pos: 'GK' | 'DF' | 'MF' | 'FW';
  role: 'starter' | 'rotation' | 'squad' | 'youth';
  nationality: string;
}

export interface Club extends Json {
  id: string;
  name: string;
  short: string;
  featured?: boolean;
}

export interface Catalog {
  league: { meta: Json; league: Json & { current_season: string; demo_fixture: { matchday: number; home: string; away: string; kickoff: string } }; clubs: Club[]; seasons: Array<Json & { season: string; matchdays_played: number; table: Array<Json & { club: string }> }> };
  people: { staff: Array<Json & { club: string; role: string }>; players: Player[] };
  statistics: { player_seasons: Array<Json & { player: string; season: string }>; unavailable: Array<Json & { player: string }>; summaries: { clubs: Record<string, Json>; head_to_head: Json; players: Record<string, Json> } };
  content: { featured: Record<string, Json>; league_glossary: Json[]; former_managers: Array<Json & { club: string }>; countries: Record<string, Json> };
}

export function loadCatalog(dir: string): Catalog {
  const read = (name: string) => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
  return { league: read('league'), people: read('people'), statistics: read('statistics'), content: read('content') };
}
