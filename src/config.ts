// NPI dials for NCAA Division III men's soccer.
// Source: NCAA "DIII Men's Soccer NPI Weights" (2023-24 report, per user instruction).
// Verify against the current-year weights before relying on results.
export interface NpiConfig {
  winPct: number;       // weight of winning percentage (0-1)
  sos: number;          // weight of strength of schedule (0-1)
  homeWin: number;      // home/away multipliers; 1.0/1.0 = no adjustment (not applied in soccer)
  awayWin: number;
  qwbBase: number;      // quality win base
  qwbMultiplier: number;
  minWins: number;      // minimum number of wins retained in the calculation
  tieWinShare: number;  // tie value dial: share of a tie counted as a win (default .500)
  maxIterations: number;
  tolerance: number;
}

export const D3_MSOC_CONFIG: NpiConfig = {
  winPct: 0.15,
  sos: 0.85,
  homeWin: 1.0,
  awayWin: 1.0,
  qwbBase: 54.0,
  qwbMultiplier: 0.75,
  minWins: 10,
  tieWinShare: 0.5,
  maxIterations: 500,
  tolerance: 1e-9,
};
