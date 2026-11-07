import { computeNpi, Game, TeamNpi, lastConverged } from "./engine";
import { D3_MSOC_CONFIG } from "./config";
import { loadOfficial, resolveName, loadBidConfig } from "./teams";
import { loadGames, loadScenario } from "./store";
import { StoredGame } from "./ncaa";

export interface LeagueRow {
  team: string;
  conference: string;
  region: string;
  npi: number | null;
  rank: number | null;
  baseNpi: number | null;
  baseRank: number | null;
  officialNpi: number | null;
  officialRank: number | null;
  record: string; // actual results only, W-L-T
  adjusted: string; // adjusted record under the scenario, e.g. 8.0-3.0
  bid: "AQ" | "At-Lg" | ""; // projected: AQ = best NPI in its conference; At-Lg = in the at-large field
  atLgRank: number | null; // position among teams that are not AQs, by NPI
  bidChange: "in" | "out" | ""; // field status changed versus actual results only
}

export interface LeagueResult {
  rows: LeagueRow[];
  converged: boolean;
  matchedGames: number;
  hypotheticalGames: number;
  unmatched: { name: string; games: number }[];
  vsOfficial: { teams: number; meanAbsDiff: number; maxAbsDiff: number; worst: { team: string; ours: number; official: number }[] } | null;
  updatedAt: string | null;
  bids: { fieldSize: number; aqCount: number; atLargeSpots: number };
  computeMs: number;
}

/**
 * Projected bids. The best-NPI team in each conference is treated as its automatic qualifier (AQ);
 * the rest are ranked by NPI and the top (fieldSize - AQs) get at-large bids.
 * Note: real AQs go to conference tournament winners, so this is a projection.
 */
export function computeBids(
  teams: { team: string; conference: string; rank: number | null }[],
  cfg = loadBidConfig(),
) {
  const ranked = teams.filter((t) => t.rank !== null).sort((a, b) => (a.rank as number) - (b.rank as number));
  const aqConf = new Set<string>();
  const aq = new Set<string>();
  // Decided champions (data/bids.json "champions": { conference: team }) take the bid before the best-NPI guess.
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const t of ranked) {
    const champ = cfg.champions[t.conference];
    if (champ && norm(champ) === norm(t.team) && !cfg.noAutomaticBid.includes(t.conference)) { aqConf.add(t.conference); aq.add(t.team); }
  }
  for (const t of ranked) {
    if (cfg.noAutomaticBid.includes(t.conference) || aqConf.has(t.conference)) continue;
    aqConf.add(t.conference);
    aq.add(t.team);
  }
  const spots = Math.max(0, cfg.fieldSize - aq.size);
  const out = new Map<string, { bid: "AQ" | "At-Lg" | ""; atLgRank: number | null }>();
  let n = 0;
  for (const t of ranked) {
    if (aq.has(t.team)) { out.set(t.team, { bid: "AQ", atLgRank: null }); continue; }
    n++;
    out.set(t.team, { bid: n <= spots ? "At-Lg" : "", atLgRank: n });
  }
  return { map: out, aqCount: aq.size, atLargeSpots: spots, fieldSize: cfg.fieldSize };
}

export function buildGames() {
  const db = loadGames();
  const scenario = loadScenario();
  const official = loadOfficial();
  const unmatched = new Map<string, number>();
  const actual: Game[] = [];
  const hypo: Game[] = [];
  for (const g of db.games) {
    const h = resolveName(g.home, official);
    const a = resolveName(g.away, official);
    if (!h || !a) {
      // One side is not in the NPI list (a non-Division III opponent): the game does not count for NPI.
      for (const [raw, res] of [[g.home, h], [g.away, a]] as const) if (!res && (h || a)) unmatched.set(raw, (unmatched.get(raw) ?? 0) + 1);
      continue;
    }
    if (g.state === "final" && g.homeScore !== null && g.awayScore !== null) {
      actual.push({ id: g.id, home: h, away: a, homeScore: g.homeScore, awayScore: g.awayScore, kind: "actual", date: g.date });
    } else if (scenario[g.id]) {
      hypo.push({ id: g.id, home: h, away: a, homeScore: scenario[g.id][0], awayScore: scenario[g.id][1], kind: "hypothetical", date: g.date });
    }
  }
  return { db, official, actual, hypo, unmatched, scenario };
}

// Cached results. The calculation is heavy, so it is redone only when the downloaded games or the
// projections actually change. The projected run starts from the actual-results answer, which is close.
let baseCache: { key: string; base: TeamNpi[]; converged: boolean } | null = null;
let leagueCache: { key: string; result: LeagueResult } | null = null;

export function computeLeague(): LeagueResult {
  const { db, official, actual, hypo, unmatched } = buildGames();
  const baseKey = `${db.updatedAt}|${db.games.length}|${actual.length}|${actual.reduce((a, g) => a + g.homeScore * 31 + g.awayScore, 0)}`;
  const scenKey = baseKey + "|" + hypo.map((g) => `${g.id}:${g.homeScore}-${g.awayScore}`).sort().join(",");
  if (leagueCache && leagueCache.key === scenKey) return leagueCache.result;
  const started = Date.now();

  const initial = new Map<string, number>();
  for (const t of official.teams) if (t.npi !== null) initial.set(t.name, t.npi);

  if (!baseCache || baseCache.key !== baseKey) {
    const b = computeNpi(actual, D3_MSOC_CONFIG, { includeHypothetical: false, initial });
    baseCache = { key: baseKey, base: b, converged: lastConverged };
  }
  const base = baseCache.base;
  const baseConverged = baseCache.converged;
  const warm = new Map(base.map((r) => [r.team, r.npi]));
  const scen = hypo.length ? computeNpi([...actual, ...hypo], D3_MSOC_CONFIG, { includeHypothetical: true, initial: warm }) : base;
  const converged = baseConverged && (hypo.length ? lastConverged : true);

  const baseBy = new Map<string, TeamNpi>(base.map((r) => [r.team, r]));
  const scenBy = new Map<string, TeamNpi>(scen.map((r) => [r.team, r]));
  const recBy = new Map<string, { w: number; l: number; t: number }>();
  for (const r of base) recBy.set(r.team, r.overall);

  const rows: LeagueRow[] = official.teams.map((t) => {
    const s = scenBy.get(t.name);
    const b = baseBy.get(t.name);
    const rec = recBy.get(t.name);
    return {
      team: t.name,
      conference: t.conference,
      region: t.region,
      npi: s ? s.npi : null,
      rank: s ? s.rank : null,
      baseNpi: b ? b.npi : null,
      baseRank: b ? b.rank : null,
      officialNpi: t.npi,
      officialRank: t.rank,
      record: rec ? `${rec.w}-${rec.l}-${rec.t}` : "0-0-0",
      adjusted: s ? `${s.adjusted.w.toFixed(1)}-${s.adjusted.l.toFixed(1)}` : "",
      bid: "" as "" | "AQ" | "At-Lg",
      atLgRank: null as number | null,
      bidChange: "" as "" | "in" | "out",
    };
  });
  // Projected bids, with and without the user's assumed scores.
  const bidsNow = computeBids(rows.map((r) => ({ team: r.team, conference: r.conference, rank: r.rank })));
  const bidsBase = computeBids(rows.map((r) => ({ team: r.team, conference: r.conference, rank: r.baseRank })));
  for (const r of rows) {
    const now = bidsNow.map.get(r.team), was = bidsBase.map.get(r.team);
    r.bid = now?.bid ?? "";
    r.atLgRank = now?.atLgRank ?? null;
    const inNow = r.bid !== "", inWas = (was?.bid ?? "") !== "";
    r.bidChange = hypo.length && inNow !== inWas ? (inNow ? "in" : "out") : "";
  }
  rows.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.team.localeCompare(b.team));

  // How far is our from-scratch recompute (actual games only) from the NCAA's own list?
  const diffs = rows
    .filter((r) => r.baseNpi !== null && r.officialNpi !== null)
    .map((r) => ({ team: r.team, ours: r.baseNpi as number, official: r.officialNpi as number }))
    .map((d) => ({ ...d, abs: Math.abs(d.ours - d.official) }));
  const vsOfficial = diffs.length
    ? {
        teams: diffs.length,
        meanAbsDiff: diffs.reduce((a, d) => a + d.abs, 0) / diffs.length,
        maxAbsDiff: Math.max(...diffs.map((d) => d.abs)),
        worst: diffs.sort((a, b) => b.abs - a.abs).slice(0, 5).map(({ team, ours, official }) => ({ team, ours, official })),
      }
    : null;

  const result: LeagueResult = {
    rows,
    converged,
    matchedGames: actual.length,
    hypotheticalGames: hypo.length,
    unmatched: [...unmatched.entries()].map(([name, games]) => ({ name, games })).sort((a, b) => b.games - a.games),
    vsOfficial,
    updatedAt: db.updatedAt,
    bids: { fieldSize: bidsNow.fieldSize, aqCount: bidsNow.aqCount, atLargeSpots: bidsNow.atLargeSpots },
    computeMs: Date.now() - started,
  };
  leagueCache = { key: scenKey, result };
  return result;
}

export interface TeamGameRow {
  id: string;
  date: string;
  time: string;
  homeAway: "home" | "away";
  opponent: string;
  opponentNpi: number | null;
  state: string;
  result: "W" | "L" | "T" | null;
  score: string;
  hypothetical: boolean;
  scenario: [number, number] | null;
  countsForNpi: boolean;
}

export function teamDetail(team: string) {
  const { db, official, scenario } = buildGames();
  const league = computeLeague();
  const npiBy = new Map(league.rows.map((r) => [r.team, r.npi]));
  const games: TeamGameRow[] = [];
  for (const g of db.games as StoredGame[]) {
    const h = resolveName(g.home, official);
    const a = resolveName(g.away, official);
    if (h !== team && a !== team) continue;
    const isHome = h === team;
    const oppRaw = isHome ? g.away : g.home;
    const opp = (isHome ? a : h) ?? oppRaw;
    const final = g.state === "final" && g.homeScore !== null && g.awayScore !== null;
    const sc = !final ? scenario[g.id] ?? null : null;
    const my = final ? (isHome ? g.homeScore! : g.awayScore!) : sc ? (isHome ? sc[0] : sc[1]) : null;
    const their = final ? (isHome ? g.awayScore! : g.homeScore!) : sc ? (isHome ? sc[1] : sc[0]) : null;
    games.push({
      id: g.id, date: g.date, time: g.time, homeAway: isHome ? "home" : "away",
      opponent: opp, opponentNpi: npiBy.get(opp) ?? null, state: g.state,
      result: my === null || their === null ? null : my > their ? "W" : my < their ? "L" : "T",
      score: my === null || their === null ? "" : `${my}-${their}`,
      hypothetical: !final && !!sc, scenario: sc, countsForNpi: !!(h && a),
    });
  }
  games.sort((x, y) => x.date.localeCompare(y.date) || x.time.localeCompare(y.time));
  return { team, row: league.rows.find((r) => r.team === team) ?? null, games };
}

export interface UpcomingGame {
  id: string;
  date: string;
  time: string;
  home: string;
  away: string;
  homeNpi: number | null;
  awayNpi: number | null;
  scenario: [number, number] | null;
}

/** Every game not yet played where both teams are in the NPI list, soonest first. */
export function upcomingGames(): UpcomingGame[] {
  const { db, official, scenario } = buildGames();
  const league = computeLeague();
  const npiBy = new Map(league.rows.map((r) => [r.team, r.npi]));
  const out: UpcomingGame[] = [];
  for (const g of db.games as StoredGame[]) {
    if (g.state === "final") continue;
    const h = resolveName(g.home, official);
    const a = resolveName(g.away, official);
    if (!h || !a) continue;
    out.push({ id: g.id, date: g.date, time: g.time, home: h, away: a, homeNpi: npiBy.get(h) ?? null, awayNpi: npiBy.get(a) ?? null, scenario: scenario[g.id] ?? null });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || x.time.localeCompare(y.time) || x.home.localeCompare(y.home));
}
