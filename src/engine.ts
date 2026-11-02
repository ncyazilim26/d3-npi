import { NpiConfig, D3_MSOC_CONFIG } from "./config";

export interface Game {
  id: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  kind: "actual" | "hypothetical";
  date?: string;
  // Games vs non-Division III opponents are excluded from NPI. Mark those with false.
  countsForNpi?: boolean;
}

export interface TeamNpi {
  team: string;
  npi: number;
  rank: number;
  overall: { w: number; l: number; t: number };
  adjusted: { w: number; l: number; t: number };
}

type Result = "W" | "L" | "T";

export interface TeamGame {
  opp: string;
  result: Result;
}

function resultFor(game: Game, team: string): TeamGame {
  const isHome = game.home === team;
  const mine = isHome ? game.homeScore : game.awayScore;
  const theirs = isHome ? game.awayScore : game.homeScore;
  return {
    opp: isHome ? game.away : game.home,
    result: mine > theirs ? "W" : mine < theirs ? "L" : "T",
  };
}

/** Value of one game for a team, given the opponent's current NPI. */
export function gameValue(result: Result, oppNpi: number, cfg: NpiConfig): number {
  const win = cfg.winPct * 100 + cfg.sos * oppNpi;
  const loss = cfg.winPct * 0 + cfg.sos * oppNpi;
  const bonus = Math.max(0, oppNpi - cfg.qwbBase) * cfg.qwbMultiplier;
  if (result === "W") return win + bonus;
  if (result === "L") return loss;
  // Tie = win portion + loss portion (default 50/50); the QWB applies to the partial win.
  return (win + bonus) * cfg.tieWinShare + loss * (1 - cfg.tieWinShare);
}

/**
 * Compute one team's NPI from its games and the opponents' current NPIs.
 *
 * Every game becomes a win portion (weight 1 for a win, tieWinShare for a tie)
 * and/or a loss portion (weight 1 for a loss, 1 - tieWinShare for a tie).
 * Win portions are dropped when they would lower NPI (but at least minWins of
 * win weight stays). Loss portions are dropped when they would raise NPI,
 * i.e. a loss worth more than the team's own NPI never helps it.
 * The kept set and the NPI are solved together by iterating to a fixed point.
 */
export function teamNpi(games: TeamGame[], npis: Map<string, number>, cfg: NpiConfig) {
  type Item = { v: number; w: number; win: boolean };
  const items: Item[] = [];
  const overall = { w: 0, l: 0, t: 0 };
  const s = cfg.tieWinShare;
  for (const g of games) {
    const opp = npis.get(g.opp) ?? 50;
    const win = cfg.winPct * 100 + cfg.sos * opp + Math.max(0, opp - cfg.qwbBase) * cfg.qwbMultiplier;
    const loss = cfg.sos * opp;
    if (g.result === "W") { items.push({ v: win, w: 1, win: true }); overall.w++; }
    else if (g.result === "L") { items.push({ v: loss, w: 1, win: false }); overall.l++; }
    else {
      items.push({ v: win, w: s, win: true });
      items.push({ v: loss, w: 1 - s, win: false });
      overall.t++;
    }
  }
  const wins = items.filter((i) => i.win).sort((a, b) => b.v - a.v);
  const losses = items.filter((i) => !i.win);
  const avgOf = (set: Item[]) => {
    const tw = set.reduce((a, i) => a + i.w, 0);
    return tw === 0 ? 0 : set.reduce((a, i) => a + i.v * i.w, 0) / tw;
  };

  let kept: Item[] = items;
  let npi = avgOf(items);
  for (let iter = 0; iter < 100; iter++) {
    const next: Item[] = [];
    let winWeight = 0;
    for (const i of wins) {
      if (i.v >= npi) { next.push(i); winWeight += i.w; }
      else if (winWeight < cfg.minWins) {
        // Needed to reach the minimum; a win that overshoots is only partly kept.
        const w = Math.min(i.w, cfg.minWins - winWeight);
        next.push({ ...i, w });
        winWeight += w;
      }
    }
    for (const i of losses) if (i.v <= npi) next.push(i);
    const nextNpi = avgOf(next);
    const stable = Math.abs(nextNpi - npi) < 1e-12 && next.length === kept.length;
    kept = next;
    npi = nextNpi;
    if (stable) break;
  }
  const kw = kept.filter((i) => i.win).reduce((a, i) => a + i.w, 0);
  const kl = kept.filter((i) => !i.win).reduce((a, i) => a + i.w, 0);
  return { npi, adjusted: { w: kw, l: kl, t: 0 }, overall };
}

/** True if the most recent computeNpi call reached its tolerance before running out of iterations. */
export let lastConverged = true;

/** Iterate until opponent NPIs and team NPIs agree (NPI is circular via SOS and QWB). */
export function computeNpi(
  allGames: Game[],
  cfg: NpiConfig = D3_MSOC_CONFIG,
  opts: { includeHypothetical?: boolean; initial?: Map<string, number> } = { includeHypothetical: true },
): TeamNpi[] {
  const games = allGames.filter(
    (g) => g.countsForNpi !== false && (opts.includeHypothetical !== false || g.kind === "actual"),
  );

  const byTeam = new Map<string, TeamGame[]>();
  for (const g of games) {
    for (const t of [g.home, g.away]) {
      if (!byTeam.has(t)) byTeam.set(t, []);
      byTeam.get(t)!.push(resultFor(g, t));
    }
  }

  let npis = new Map<string, number>([...byTeam.keys()].map((t) => [t, opts.initial?.get(t) ?? 50]));
  let details = new Map<string, ReturnType<typeof teamNpi>>();
  let converged = false;

  for (let i = 0; i < cfg.maxIterations; i++) {
    const next = new Map<string, number>();
    details = new Map();
    let delta = 0;
    for (const [team, tg] of byTeam) {
      const d = teamNpi(tg, npis, cfg);
      details.set(team, d);
      next.set(team, d.npi);
      delta = Math.max(delta, Math.abs(d.npi - (npis.get(team) ?? 0)));
    }
    npis = next;
    if (delta < cfg.tolerance) { converged = true; break; }
  }
  lastConverged = converged;

  return [...details.entries()]
    .map(([team, d]) => ({ team, npi: d.npi, rank: 0, overall: d.overall, adjusted: d.adjusted }))
    .sort((a, b) => b.npi - a.npi)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
