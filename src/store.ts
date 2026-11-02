import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "./teams";
import { StoredGame } from "./ncaa";

mkdirSync(DATA_DIR, { recursive: true });
const gamesFile = join(DATA_DIR, "games.json");
const scenarioFile = join(DATA_DIR, "projections.json");

export interface GamesDb {
  updatedAt: string | null;
  games: StoredGame[];
  fetched: string[]; // calendar days already pulled from the NCAA feed
}
/** gameId -> [homeScore, awayScore] the user is assuming for a game that has not been played. */
export type Scenario = Record<string, [number, number]>;

export function loadGames(): GamesDb {
  if (!existsSync(gamesFile)) return { updatedAt: null, games: [], fetched: [] };
  const db = JSON.parse(readFileSync(gamesFile, "utf8"));
  return { updatedAt: db.updatedAt ?? null, games: db.games ?? [], fetched: db.fetched ?? [] };
}
export function saveGames(db: GamesDb) {
  writeFileSync(gamesFile, JSON.stringify(db));
}
export function loadScenario(): Scenario {
  if (!existsSync(scenarioFile)) return {};
  return JSON.parse(readFileSync(scenarioFile, "utf8"));
}
export function saveScenario(s: Scenario) {
  writeFileSync(scenarioFile, JSON.stringify(s, null, 1));
}
