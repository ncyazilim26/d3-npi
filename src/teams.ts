import { readFileSync, existsSync } from "fs";
import { join } from "path";

export const DATA_DIR = process.env.NPI_DATA_DIR || join(process.cwd(), "data");

export interface OfficialTeam {
  name: string;
  conference: string;
  region: string;
  rank: number | null;
  npi: number | null;
  record: string;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9()]+/g, " ").trim();

/** The NCAA's published NPI list (tab-separated copy from stats.ncaa.org). Replace data/official-npi.tsv to refresh. */
export function loadOfficial(): { teams: OfficialTeam[]; byNorm: Map<string, OfficialTeam>; aliases: Map<string, string> } {
  const file = join(DATA_DIR, "official-npi.tsv");
  const teams: OfficialTeam[] = [];
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/).slice(1)) {
      const c = line.split("\t");
      if (!c[0]) continue;
      const npi = parseFloat(c[4]);
      teams.push({
        name: c[0].trim(),
        conference: (c[1] ?? "").trim(),
        region: (c[2] ?? "").trim(),
        rank: c[3] && !isNaN(parseInt(c[3])) ? parseInt(c[3]) : null,
        npi: isNaN(npi) ? null : npi,
        record: (c[6] ?? "").trim(),
      });
    }
  }
  const byNorm = new Map(teams.map((t) => [norm(t.name), t]));
  // Optional manual fixes: { "NCAA scoreboard name": "name in the NPI list" }
  const aliases = new Map<string, string>();
  const af = join(DATA_DIR, "aliases.json");
  if (existsSync(af)) {
    const obj = JSON.parse(readFileSync(af, "utf8")) as Record<string, string>;
    for (const [k, v] of Object.entries(obj)) aliases.set(norm(k), v);
  }
  return { teams, byNorm, aliases };
}

export function resolveName(
  scoreboardName: string,
  official: ReturnType<typeof loadOfficial>,
): string | null {
  const n = norm(scoreboardName);
  const aliased = official.aliases.get(n);
  if (aliased) return aliased;
  return official.byNorm.get(n)?.name ?? null;
}

export interface BidConfig { fieldSize: number; noAutomaticBid: string[]; champions: Record<string, string> }
/** Tournament size and which "conferences" have no automatic bid (data/bids.json). */
export function loadBidConfig(): BidConfig {
  const f = join(DATA_DIR, "bids.json");
  const def: BidConfig = { fieldSize: 64, noAutomaticBid: ["DIII Independent", "C2C"], champions: {} };
  if (!existsSync(f)) return def;
  const j = JSON.parse(readFileSync(f, "utf8"));
  return { fieldSize: Number(j.fieldSize) || def.fieldSize, noAutomaticBid: Array.isArray(j.noAutomaticBid) ? j.noAutomaticBid : def.noAutomaticBid, champions: j.champions && typeof j.champions === "object" ? j.champions : {} };
}
