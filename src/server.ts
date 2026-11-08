import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync } from "fs";
import { join } from "path";
import { computeLeague, teamDetail, upcomingGames } from "./compute";
import { loadGames, saveGames, loadScenario, saveScenario, setUser, pruneAllScenarios } from "./store";
import { fetchDay, datesBetween, NCAA_BASE } from "./ncaa";

const PORT = Number(process.env.PORT || 3000);
const SEASON_START = process.env.SEASON_START || "2026-08-20";
const SEASON_END = process.env.SEASON_END || "2026-11-09";

const todayEt = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

let refreshing = false;
async function refresh(full: boolean) {
  if (refreshing) throw new Error("A refresh is already running.");
  refreshing = true;
  try {
    const db = loadGames();
    const today = todayEt();
    const yesterday = new Date(Date.parse(today + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
    const pendingDates = new Set(db.games.filter((g) => g.state !== "final").map((g) => g.date));
    const fetched = new Set(db.fetched);
    // Days to pull: never fetched, still holding unfinished games, or recent enough that scores may have changed.
    const dates = datesBetween(SEASON_START, SEASON_END).filter(
      (d) => full || !fetched.has(d) || pendingDates.has(d) || d >= yesterday,
    );
    const byId = new Map(db.games.map((g) => [g.id, g]));
    let errors: string[] = [];
    for (let i = 0; i < dates.length; i += 4) {
      const chunk = dates.slice(i, i + 4);
      const results = await Promise.allSettled(chunk.map((d) => fetchDay(d)));
      results.forEach((r, k) => {
        if (r.status === "fulfilled") {
          for (const g of r.value) byId.set(g.id, g);
          fetched.add(chunk[k]);
        } else errors.push(String(r.reason?.message ?? r.reason));
      });
      await new Promise((r) => setTimeout(r, 900)); // stay under the feed's 5 requests/second limit
    }
    const games = [...byId.values()];
    saveGames({ updatedAt: new Date().toISOString(), games, fetched: [...fetched].sort() });
    // A game that has now been played no longer needs its assumed score.
    const cleared = pruneAllScenarios(new Set(games.filter((g) => g.state === "final").map((g) => g.id)));
    return { daysChecked: dates.length, games: games.length, final: games.filter((g) => g.state === "final").length, errors, projectionsCleared: cleared, source: NCAA_BASE };
  } finally {
    refreshing = false;
  }
}

const readBody = (req: IncomingMessage) =>
  new Promise<any>((resolve, reject) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
  });
const send = (res: ServerResponse, code: number, body: unknown, type = "application/json") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : (body as string));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  try {
    setUser(req.headers["x-user"]);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html"))
      return send(res, 200, readFileSync(join(process.cwd(), "public", "index.html"), "utf8"), "text/html; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/api/league") return send(res, 200, computeLeague());
    if (req.method === "GET" && url.pathname === "/api/upcoming") return send(res, 200, upcomingGames());
    if (req.method === "GET" && url.pathname === "/api/team") return send(res, 200, teamDetail(url.searchParams.get("name") || ""));
    if (req.method === "POST" && url.pathname === "/api/refresh") {
      const body = await readBody(req);
      return send(res, 200, await refresh(!!body.full));
    }
    if (req.method === "POST" && url.pathname === "/api/scenario") {
      const { id, home, away } = await readBody(req);
      if (typeof id !== "string" || !id || id.length > 80) return send(res, 400, { error: "Bad game id." });
      const scen = loadScenario();
      if (home === null || away === null || home === "" || away === "") delete scen[id];
      else {
        const h = Number(home), a = Number(away);
        if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h > 99 || a > 99) return send(res, 400, { error: "Scores must be whole numbers." });
        scen[id] = [h, a];
      }
      saveScenario(scen);
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/scenario/clear") { saveScenario({}); return send(res, 200, { ok: true }); }
    send(res, 404, { error: "Not found" });
  } catch (e) {
    send(res, 500, { error: (e as Error).message });
  }
});
server.listen(PORT, () => console.log(`\nD3 Men's Soccer NPI is running.\nOpen this in your browser:  http://localhost:${PORT}\n(Leave this window open. Press Ctrl+C to stop.)\n`));
