// PROTOTYPE, delete with the ledger prototype: player names for one season's box ids, from ESPN, so the ledger
// can name who joined or left. node scripts/prototype/names.mjs 2026-27
import { readFileSync, writeFileSync } from "node:fs";
const season = process.argv[2];
const box = JSON.parse(readFileSync(`src/data/box/${season}.json`, "utf8"));
const ids = new Set();
for (const teams of Object.values(box.games)) for (const lines of Object.values(teams)) for (const l of lines) ids.add(l[0]);
const names = {};
const teams = (await (await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams")).json()).sports[0].leagues[0].teams;
for (const { team } of teams) {
  const r = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${team.id}/roster`)).json();
  for (const a of r.athletes ?? []) if (ids.has(Number(a.id))) names[a.id] = a.displayName;
}
for (const id of ids) if (!names[id]) {
  const j = await (await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}`)).json().catch(() => ({}));
  names[id] = j.athlete?.displayName ?? `#${id}`;
}
writeFileSync(`src/data/prototype-names-${season}.json`, JSON.stringify(names, null, 0) + "\n");
console.log(Object.keys(names).length, "names");
