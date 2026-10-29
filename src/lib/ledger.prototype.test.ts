import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

// The ledger reads the data through import.meta.glob, so it loads through Vite, as the dev server loads it.
const server = await createServer({ root: new URL("../..", import.meta.url).pathname, configFile: false, logLevel: "error", server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { allSeasons } = (await server.ssrLoadModule("/src/lib/season.ts")) as typeof import("./season.ts");
const { ledger, walk } = (await server.ssrLoadModule("/src/lib/ledger.prototype.ts")) as typeof import("./ledger.prototype.ts");

const LOGS = [["2026-27", "OKC"], ["2024-25", "LAL"], ["2024-25", "OKC"], ["2023-24", "BOS"], ["2019-20", "MIA"]] as const;

test("every row's walk adds up, part by part and in all, shows each player once, and keeps 1.0 out of the under-a-point lines", () => {
  const seasons = allSeasons();
  let rows = 0;
  for (const [id, abbr] of LOGS) {
    const season = seasons.find((s) => s.id === id)!;
    for (const row of ledger(season, abbr)) {
      const at = `${id} ${abbr} ${row.day}`;
      const w = walk(season, row);
      rows++;
      assert.equal(w.whole.result + w.whole.players + w.whole.others, row.change, `${at}: the three parts add up to the change`);
      for (const part of w.parts) {
        assert.equal(part.lines.reduce((s, l) => s + l.whole, 0), part.whole, `${at}: ${part.label}'s lines add up to its figure`);
      }
      const groups = w.parts.flatMap((p) => p.lines.flatMap((l) => (l.kind === "group" ? l.items : [])));
      assert.deepEqual(groups.filter((x) => Math.abs(x.points) >= 0.95).map((x) => x.name), [], `${at}: nothing under a point reads as 1.0 or more`);
      const names = w.parts.flatMap((p) => p.lines.flatMap((l) => (l.kind === "group" ? l.items : [l]))).filter((x) => x.kind === "player").map((x) => x.name);
      assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), [], `${at}: no player shows twice`);
    }
  }
  assert.ok(rows > 300, `walked ${rows} rows`);
});
