import { test } from "node:test";
import assert from "node:assert/strict";
import { abbrMap, lastAtOrBefore, pairEvents, parseSlug, reject, sameTeam } from "./polymarket.ts";

test("a game slug reads as away, home and ET date; props and other slugs read as nothing", () => {
  assert.deepEqual(parseSlug("nba-atl-nyk-2025-01-20"), { away: "atl", home: "nyk", date: "2025-01-20" });
  assert.equal(parseSlug("nba-atl-nyk-2025-01-20-spread-home-5pt5"), null);
  assert.equal(parseSlug("nba-will-the-heat-beat-the-wizards"), null);
});

test("Polymarket's abbreviations map to ESPN's by team name, and All-Star sides drop out", () => {
  const team = (short: string) => ({ name: `X ${short}`, short, color: "000000", alternateColor: "ffffff" });
  const map = abbrMap(
    [{ abbreviation: "uta", name: "Jazz" }, { abbreviation: "nop", name: "Pelicans" }, { abbreviation: "world", name: "Team World" }],
    { UTAH: team("Jazz"), NO: team("Pelicans"), BOS: team("Celtics") },
  );
  assert.deepEqual(map, { uta: "UTAH", nop: "NO" });
});

test("an outcome names a team by its short name, and Twolves or T-Wolves names the Timberwolves", () => {
  assert.equal(sameTeam("Trail Blazers", "Trail Blazers"), true);
  assert.equal(sameTeam("Twolves", "Timberwolves"), true);
  assert.equal(sameTeam("T-Wolves", "Timberwolves"), true);
  assert.equal(sameTeam("Lakers", "Timberwolves"), false);
});

test("the price is the last point at or before the cutoff, never one after it", () => {
  const history = [{ t: 100, p: 0.6 }, { t: 200, p: 0.62 }, { t: 300, p: 0.9 }];
  assert.deepEqual(lastAtOrBefore(history, 200), { t: 200, p: 0.62 });
  assert.deepEqual(lastAtOrBefore(history, 299), { t: 200, p: 0.62 });
  assert.equal(lastAtOrBefore(history, 99), null);
});

test("a game pairs with its own day's event before a neighbour's, then a day off, then the latest unclaimed earlier one", () => {
  const ev = (date: string, pair = "BOS NY") => ({ date, pair });
  const games = [
    { id: "a", date: "2025-11-04", pair: "BOS NY" }, // its event is a day off; the 11-05 one is b's
    { id: "b", date: "2025-11-05", pair: "BOS NY" },
    { id: "c", date: "2026-03-19", pair: "BOS NY" }, // makeup of a game postponed from 01-25
    { id: "e", date: "2026-03-25", pair: "BOS NY" }, // left with the older unclaimed event
    { id: "d", date: "2025-11-05", pair: "LAL MIN" }, // nothing for this pair
  ];
  const events = [ev("2025-11-03"), ev("2025-11-05"), ev("2025-10-01"), ev("2026-01-25"), ev("2025-11-05", "DEN MEM")];
  const paired = pairEvents(games, events);
  assert.deepEqual(
    Object.fromEntries([...paired].map(([id, e]) => [id, e.date])),
    { a: "2025-11-03", b: "2025-11-05", c: "2026-01-25", e: "2025-10-01" },
  );
});

test("an event later than the game by more than a day is never taken", () => {
  const paired = pairEvents([{ id: "a", date: "2025-11-01", pair: "BOS NY" }], [{ date: "2025-11-03", pair: "BOS NY" }]);
  assert.equal(paired.size, 0);
});

test("a market closed within 2 hours of the cutoff is rejected; one closed later is kept", () => {
  const cutoff = 100_000, last = { t: cutoff - 60, p: 0.55 };
  assert.equal(reject(cutoff, cutoff + 7199, last), "closed early");
  assert.equal(reject(cutoff, cutoff + 7200, last), null);
  assert.equal(reject(cutoff, null, last), null);
});

test("a price older than 6 hours, or none, is rejected", () => {
  const cutoff = 100_000;
  assert.equal(reject(cutoff, null, null), "no recent price");
  assert.equal(reject(cutoff, null, { t: cutoff - 21601, p: 0.5 }), "no recent price");
  assert.equal(reject(cutoff, null, { t: cutoff - 21600, p: 0.5 }), null);
});

test("an extreme price is rejected when over 30 minutes old and kept when fresh; a stale ordinary price is kept", () => {
  const cutoff = 100_000;
  assert.equal(reject(cutoff, null, { t: cutoff - 1801, p: 0.97 }), "stale extreme");
  assert.equal(reject(cutoff, null, { t: cutoff - 1801, p: 0.03 }), "stale extreme");
  assert.equal(reject(cutoff, null, { t: cutoff - 1800, p: 0.98 }), null);
  assert.equal(reject(cutoff, null, { t: cutoff - 3600, p: 0.96 }), null);
});
