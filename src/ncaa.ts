// Pulls D3 men's soccer games from the NCAA scoreboard feed (ncaa-api by henrygd, a public wrapper
// around ncaa.com data). One request per calendar day returns every game that day, finished or not.
export const NCAA_BASE = process.env.NCAA_BASE || "https://ncaa-api.henrygd.me";

export interface StoredGame {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // e.g. "1:00 PM ET"
  home: string; // NCAA short name, e.g. "UMass Boston"
  away: string;
  state: "pre" | "live" | "final";
  homeScore: number | null;
  awayScore: number | null;
}

interface RawTeam { score?: string; names?: { short?: string } }
interface RawGame {
  game?: {
    gameID: string;
    gameState?: string;
    startDate?: string; // MM/DD/YYYY
    startTime?: string;
    home: RawTeam;
    away: RawTeam;
  };
}

function toIso(mdy: string | undefined, fallback: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(mdy ?? "");
  return m ? `${m[3]}-${m[1]}-${m[2]}` : fallback;
}

export function parseScoreboard(json: { games?: RawGame[] }, dateIso: string): StoredGame[] {
  const out: StoredGame[] = [];
  for (const w of json.games ?? []) {
    const g = w.game;
    if (!g?.home?.names?.short || !g?.away?.names?.short) continue;
    const state = g.gameState === "final" ? "final" : g.gameState === "live" ? "live" : "pre";
    const num = (s?: string) => (s !== undefined && s !== "" && !isNaN(Number(s)) ? Number(s) : null);
    out.push({
      id: String(g.gameID),
      date: toIso(g.startDate, dateIso),
      time: g.startTime ?? "",
      home: g.home.names.short,
      away: g.away.names.short,
      state,
      homeScore: state === "final" ? num(g.home.score) : null,
      awayScore: state === "final" ? num(g.away.score) : null,
    });
  }
  return out;
}

export async function fetchDay(dateIso: string): Promise<StoredGame[]> {
  const [y, m, d] = dateIso.split("-");
  const url = `${NCAA_BASE}/scoreboard/soccer-men/d3/${y}/${m}/${d}/all-conf`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return []; // no games / no board that day
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseScoreboard((await res.json()) as { games?: RawGame[] }, dateIso);
    } catch (e) {
      if (attempt === 3) throw new Error(`Could not load ${dateIso} from the NCAA feed: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return [];
}

export function datesBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const d = new Date(startIso + "T12:00:00Z");
  const end = new Date(endIso + "T12:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
