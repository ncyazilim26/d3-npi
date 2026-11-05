import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "./teams";
import { StoredGame } from "./ncaa";

mkdirSync(DATA_DIR, { recursive: true });
const gamesFile = join(DATA_DIR, "games.json");
import { readdirSync } from "fs";
/** Each visitor has a private set of projections, named by a random id kept in their browser. */
let currentUser = "default";
export function setUser(raw: unknown) {
  const u = String(raw ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
  currentUser = u || "default";
}
const scenarioPath = (u: string) => join(DATA_DIR, u === "default" ? "projections.json" : `projections-${u}.json`);

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
  const f = scenarioPath(currentUser);
  if (!existsSync(f)) return {};
  try { return JSON.parse(readFileSync(f, "utf8")); } catch { return {}; }
}
export function saveScenario(s: Scenario) {
  writeFileSync(scenarioPath(currentUser), JSON.stringify(s, null, 1));
}
/** Remove assumed scores for games that have now been played, from every visitor's projections. */
export function pruneAllScenarios(playedIds: Set<string>): number {
  let cleared = 0;
  for (const f of readdirSync(DATA_DIR)) {
    if (!/^projections(-[a-z0-9]+)?\.json$/.test(f)) continue;
    const path = join(DATA_DIR, f);
    try {
      const sc = JSON.parse(readFileSync(path, "utf8"));
      let changed = false;
      for (const id of Object.keys(sc)) if (playedIds.has(id)) { delete sc[id]; cleared++; changed = true; }
      if (changed) writeFileSync(path, JSON.stringify(sc, null, 1));
    } catch {}
  }
  return cleared;
}
