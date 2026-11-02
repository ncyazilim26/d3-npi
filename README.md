# D3 Men's Soccer NPI

A small program that runs on your own computer and opens in your web browser.

## First time (Windows)
1. Install Node.js (the LTS version) from nodejs.org, then restart the computer.
2. Unzip this folder.
3. Double-click **start.bat**. A black window opens and, after a few seconds, your browser opens the app.
   (If the browser doesn't open, go to http://localhost:3000 yourself.) Keep the black window open while you use the app.
4. Click **Go get results**. The first time it downloads the whole season and takes about a minute. After that it only refreshes recent days.

## Using it
- The right side has two tabs. **All upcoming games** lists every unplayed game in the league by date, with a score box for each side (home team on the left); you can filter by team or conference.
- **Team view:** click a team in the left table. The right side shows its played games and its upcoming games.
- Type a score for any upcoming game, or use the W / T / L buttons. The whole league's NPI is recomputed, with changes shown next to each team.
- Your assumed scores are saved. **Go get results** brings in real scores; when a game has really been played, your assumed score for it is dropped.
- **Clear all projections** removes every assumed score.

## Bids (AQ and at-large)
The left table has **Bid** and **At-Lg #** columns, like D3 Datacast. The best-NPI team in each conference is shown as **AQ** (a projection: the real automatic bid goes to the conference tournament winner). The remaining teams are ranked by NPI as **At-Lg #1, #2…**, and the first 22 get an at-large bid; a heavy line marks the cutoff. When your projected scores push a team into or out of the field, the table shows ▲in or ▼out.
`data/bids.json` sets the field size (64) and which groups have no automatic bid ("DIII Independent" and C2C, which is what gives 42 AQs and 22 at-large spots). Edit it if that changes.

## Keeping the NCAA numbers fresh
`data/official-npi.tsv` is a copy of the NCAA's published NPI list (the same tab-separated copy you pasted). Replace its contents with a newer copy whenever you want. The app uses it for the list of Division III teams, as the starting point of the calculation, and for the "check against the NCAA" box.

## If a team's games are missing
Games are matched to teams by name. If the feed spells a Division III team differently from the NPI list, the yellow box lists it. Add a line to `data/aliases.json`, for example:
    { "Feed Spelling": "Name In NPI List" }

## Settings (optional)
Season dates default to 2026-08-20 through 2026-11-09. Change them with SEASON_START / SEASON_END.
Dials (15/85, quality win base 54, multiplier .75, 10 retained wins) are in `src/config.ts`.
