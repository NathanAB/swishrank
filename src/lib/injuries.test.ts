import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArchive, parseFeed, withReport } from "./injuries.ts";

const entry = (id: number | null, returnDate: unknown = "2026-11-04") => ({
  id: "-1",
  shortComment: "A reporter's sentence.",
  longComment: "A reporter's paragraph.",
  status: "Out",
  date: "2026-10-27T21:41Z",
  athlete: {
    displayName: "A Player",
    links: id === null ? [] : [{ href: `https://www.espn.com/nba/player/_/id/${id}/a-player` }],
    team: { abbreviation: "OKC" },
  },
  details: { fantasyStatus: { abbreviation: "OUT" }, type: "Knee", location: "Leg", side: "Right", returnDate },
});
const feed = (...entries: unknown[]) => ({ season: { displayName: "2026-27" }, injuries: [{ id: "25", injuries: entries }] });

test("the injury report keeps each entry's structured fields and team, and none of its comments", () => {
  const { season, injuries, dropped } = parseFeed(feed(entry(4433255)));
  assert.equal(season, "2026-27");
  assert.equal(dropped, 0);
  assert.deepEqual(injuries, [
    { athlete: 4433255, team: "OKC", status: "Out", date: "2026-10-27T21:41Z", returnDate: "2026-11-04", type: "Knee", location: "Leg", side: "Right" },
  ]);
});

test("a malformed entry is dropped and counted, and the rest are kept", () => {
  const { injuries, dropped } = parseFeed(feed(entry(null), entry(1, "soon"), "junk", entry(2)));
  assert.deepEqual(injuries.map((i) => i.athlete), [2]);
  assert.equal(dropped, 3);
  assert.deepEqual(parseFeed({ status: "error" }), { season: undefined, injuries: [], dropped: 0 }, "a feed with no report parses to nothing");
});

test("a day's first saved report stands, and the archive reads back as it was written", () => {
  const first = { fetched: "2026-10-29T08:17:00.000Z", injuries: parseFeed(feed(entry(1))).injuries };
  const later = { fetched: "2026-10-29T12:17:00.000Z", injuries: parseFeed(feed(entry(2))).injuries };
  const archive = withReport(withReport(withReport({ season: "2026-27", days: {} }, "2026-10-29", first), "2026-10-28", later), "2026-10-29", later);
  assert.deepEqual(Object.keys(archive.days), ["2026-10-28", "2026-10-29"]);
  assert.deepEqual(archive.days["2026-10-29"], first);
  assert.deepEqual(parseArchive(JSON.parse(JSON.stringify(archive)), "2026-27"), archive);
  assert.throws(() => parseArchive({ season: "2026-27", days: { "2026-10-28": { fetched: first.fetched, injuries: [{ athlete: "x" }] } } }, "2026-27"), /malformed injury/);
  assert.throws(() => parseArchive({ season: "2026-27", days: { "2026-10-28": first.injuries } }, "2026-27"), /time it was fetched/);
});
