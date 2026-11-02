// A fake NCAA feed for testing: same JSON shape as ncaa-api, synthetic games plus TCNJ's real 2026 schedule.
import { createServer } from "http";
import { readFileSync } from "fs";
const teams = readFileSync("data/official-npi.tsv", "utf8").split("\n").slice(1).map((l) => l.split("\t")[0]).filter(Boolean);
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
type G = { id: string; date: string; home: string; away: string; hs: number; as: number; state: string };
const games: G[] = []; let n = 1000;
const add = (date: string, home: string, away: string, hs: number, as: number, state = "final") => games.push({ id: String(n++), date, home, away, hs, as, state });
for (let i = 0; i < 1800; i++) {
  const a = teams[Math.floor(rnd() * teams.length)], b = teams[Math.floor(rnd() * teams.length)];
  if (a === b) continue;
  const day = 1 + Math.floor(rnd() * 37); // Sep 1 .. Oct 7
  const d = day <= 30 ? `2026-09-${String(day).padStart(2, "0")}` : `2026-10-0${day - 30}`;
  add(d, a, b, Math.floor(rnd() * 4), Math.floor(rnd() * 3));
}
const tc = [["09-01","Manhattanville",2,2,1],["09-05","Elmira",3,1,0],["09-06","Ithaca",2,2,0],["09-12","Farmingdale St.",4,0,1],["09-16","Muhlenberg",1,1,1],["09-19","Hunter",4,2,1],["09-22","Swarthmore",0,0,1],["09-26","Neumann",3,0,0],["09-30","Rowan",1,1,1],["10-03","Kean",4,1,0],["10-07","Montclair St.",0,0,0]] as const;
for (const [d, opp, a, b, home] of tc) add("2026-" + d, home ? "TCNJ" : opp, home ? opp : "TCNJ", home ? a : b, home ? b : a);
add("2026-10-10", "TCNJ", "Rutgers-Newark", 0, 0, "pre");
add("2026-10-14", "Rowan", "TCNJ", 0, 0, "pre");
const toRaw = (g: G) => ({ game: { gameID: g.id, title: `${g.away} ${g.home}`, gameState: g.state, startDate: `${g.date.slice(5, 7)}/${g.date.slice(8)}/2026`, startTime: "1:00 PM ET",
  home: { score: g.state === "final" ? String(g.hs) : "", names: { short: g.home } }, away: { score: g.state === "final" ? String(g.as) : "", names: { short: g.away } } } });
createServer((req, res) => {
  const m = /scoreboard\/soccer-men\/d3\/(\d{4})\/(\d{2})\/(\d{2})/.exec(req.url || "");
  if (!m) { res.writeHead(404); return res.end("{}"); }
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ updated_at: "x", games: games.filter((g) => g.date === date).map(toRaw) }));
}).listen(4010, () => console.log("mock feed on 4010"));
