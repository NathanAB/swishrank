import { test } from "node:test";
import assert from "node:assert/strict";
import type { SeasonData } from "./elo.ts";
import { gameSides, historyReport, inTime, nameMatcher, normName, parseNbaArchive, parseReportText, teamNames, withNbaReport } from "./nba-report.ts";

const team = (name: string) => ({ name, short: name.split(" ").at(-1)!, color: "000000", alternateColor: "ffffff" });
const data: SeasonData = {
  season: "2019-20",
  teams: { NO: team("New Orleans Pelicans"), TOR: team("Toronto Raptors"), LAC: team("LA Clippers"), LAL: team("Los Angeles Lakers") },
  games: [
    { id: "1", t: "2019-10-23T00:00Z", home: "TOR", away: "NO", hs: null, as: null, final: false, neutral: false, note: null },
    { id: "2", t: "2019-10-23T02:30Z", home: "LAC", away: "LAL", hs: null, as: null, final: false, neutral: false, note: null },
  ],
};

// The 2019-20 layout, with a category column and the status after the reason.
const OLD = `                                                                            Injury Report: 10/22/19 05:30 PM

Game Date    Game Time    Matchup   Team                   Player Name                Category             Reason                          Current Status   Previous Status

10/22/2019   08:00 (ET)   NOP@TOR   New Orleans Pelicans   Gray, Josh                 G League - Two-Way   -                               Out              -

                                                           Williamson, Zion           Injury/Illness       Right Knee                      Out              -

                                    Toronto Raptors        Hollis-Jefferson, Rondae   Injury/Illness       Left groin soreness             Questionable     -

             10:30 (ET)   LAL@LAC   LA Clippers            NOT YET SUBMITTED

                                    Los Angeles Lakers     Caruso, Alex               Injury/Illness       Pelvic Bone Contusion           Probable         -

                                                           Norvell Jr., Zach          G League - Two-Way   -                               Available        Out
`;
// The 2021-22 layout: the status before the reason, and a reason wrapped onto a line of its own.
const NEW = `                                                       Injury Report: 12/01/21 05:30 PM

Game Date    Game Time    Matchup   Team                      Player Name               Current Status   Reason

                                                                                                         Injury/Illness - Left Lower Leg; Injury
12/01/2021   07:00 (ET)   ATL@IND   Toronto Raptors          Siakam, Pascal             Doubtful         Recovery
`;

test("a report's title, teams and entries come out of either layout", () => {
  const teams = teamNames(data);
  const old = parseReportText(OLD, teams);
  assert.equal(old.published, "2019-10-22T17:30");
  assert.deepEqual(old.teams, [
    { date: "2019-10-22", team: "NO", submitted: true },
    { date: "2019-10-22", team: "TOR", submitted: true },
    { date: "2019-10-22", team: "LAC", submitted: false },
    { date: "2019-10-22", team: "LAL", submitted: true },
  ]);
  assert.deepEqual(old.entries.map((e) => `${e.team} ${e.name} ${e.status}`), [
    "NO Gray, Josh Out", "NO Williamson, Zion Out", "TOR Hollis-Jefferson, Rondae Questionable", "LAL Caruso, Alex Probable", "LAL Norvell Jr., Zach Available",
  ]);
  const later = parseReportText(NEW, teams);
  assert.equal(later.published, "2021-12-01T17:30");
  assert.deepEqual(later.entries, [{ date: "2021-12-01", team: "TOR", name: "Siakam, Pascal", status: "Doubtful" }]);
  assert.equal(parseReportText("no title here", teams).published, null);
});

test("names match by full name, then by last name, ignoring accents, suffixes and punctuation", () => {
  const match = nameMatcher([[1, "Zion Williamson"], [2, "Zach Norvell Jr."], [3, "Nikola Jokić"], [4, "Jalen Williams"], [5, "Jaylin Williams"], [6, "Herbert Jones"]]);
  assert.equal(match("Williamson, Zion"), 1);
  assert.equal(match("Norvell Jr., Zach"), 2);
  assert.equal(match("Jokic, Nikola"), 3);
  assert.equal(match("Williams, Jalen"), 4);
  assert.equal(match("Williams, Jaylin"), 5);
  assert.equal(match("Williams, J."), null, "two Williamses with a J are not guessed between");
  assert.equal(match("Jones, Herb"), 6, "a last name only one player has is enough");
  assert.equal(match("Nobody, Some"), null);
  assert.equal(normName("D'Angelo Russell"), "dangelo russell");
});

test("a game takes each side's statuses; a side not submitted is null, and unmatched names are kept", () => {
  const report = parseReportText(OLD, teamNames(data));
  const players: Record<string, [number, string][]> = { NO: [[10, "Zion Williamson"]], TOR: [[20, "Rondae Hollis-Jefferson"]], LAL: [[30, "Alex Caruso"], [31, "Zach Norvell Jr."]] };
  const match = (abbr: string, name: string) => nameMatcher(players[abbr] ?? [])(name);
  assert.deepEqual(gameSides(data.games[0], report, match), { home: { 20: "Questionable" }, away: { 10: "Out" }, unmatched: ["NO Gray, Josh"] });
  assert.deepEqual(gameSides(data.games[1], report, match), { home: null, away: { 30: "Probable", 31: "Available" } });
});

test("a report reaches only games still to come, and a later one replaces it until tip-off", () => {
  const teams = teamNames(data);
  const match = (_: string, name: string) => (name.startsWith("Williamson") ? 10 : name.startsWith("Caruso") ? 30 : null);
  const empty = { season: "2019-20", games: {} };
  const first = withNbaReport(empty, data, parseReportText(OLD, teams), match, "2019-10-22T21:40:00Z");
  assert.equal(first.changed, 2);
  assert.equal(first.archive.games["1"].published, "2019-10-22T17:30");
  assert.equal(first.archive.games["1"].fetched, "2019-10-22T21:40:00Z");
  const again = withNbaReport(first.archive, data, parseReportText(OLD.replace("05:30 PM", "06:30 PM"), teams), match, "2019-10-22T22:40:00Z");
  assert.equal(again.changed, 0, "the same statuses under a later title change nothing");
  const changed = OLD.replace("Pelvic Bone Contusion           Probable", "Pelvic Bone Contusion           Out     ").replace("05:30 PM", "07:30 PM");
  const after = withNbaReport(first.archive, data, parseReportText(changed, teams), match, "2019-10-23T00:10:00Z");
  assert.equal(after.changed, 1, "game 1 has begun, so only game 2 takes the later report");
  assert.equal(after.archive.games["1"].published, "2019-10-22T17:30");
  assert.equal(after.archive.games["2"].away!["30"], "Out");
  assert.deepEqual(parseNbaArchive(JSON.parse(JSON.stringify(after.archive)), "2019-20"), after.archive);
  assert.throws(() => parseNbaArchive({ season: "2019-20", games: { 1: { published: "x", home: { 5: "Gone" }, away: null } } }, "2019-20"), /game 1 is malformed/);
});

test("historyReport: version 4's plan stops at 5 PM, a lead reads the last report before the tip", () => {
  // 7:30 PM Eastern on 2024-01-10 (EST, UTC-5).
  assert.deepEqual(historyReport("2024-01-11T00:30Z"), ["2024-01-10", 17]);
  assert.deepEqual(historyReport("2024-01-11T00:30Z", 30), ["2024-01-10", 19]);
  // 10:00 PM Eastern: the plan's rule still reads 5 PM, five hours before the tip.
  assert.deepEqual(historyReport("2024-01-11T03:00Z"), ["2024-01-10", 17]);
  assert.deepEqual(historyReport("2024-01-11T03:00Z", 30), ["2024-01-10", 21]);
  // 3:30 PM Eastern: 90 minutes before is 2 PM, 30 minutes before is 3 PM.
  assert.deepEqual(historyReport("2024-01-10T20:30Z"), ["2024-01-10", 14]);
  assert.deepEqual(historyReport("2024-01-10T20:30Z", 30), ["2024-01-10", 15]);
});

test("historyReport: a tip too early for the day's first report reads the night before's", () => {
  // Noon Eastern: the plan has none that day; with a 30-minute lead the 11 AM report is in time.
  assert.deepEqual(historyReport("2024-01-10T17:00Z"), ["2024-01-09", 20]);
  assert.deepEqual(historyReport("2024-01-10T17:00Z", 30), ["2024-01-10", 11]);
  // 11:00 AM Eastern: 10:30 is before the first report of the day.
  assert.deepEqual(historyReport("2024-01-10T16:00Z", 30), ["2024-01-09", 20]);
});

test("inTime: a report counts only when its printed time is at least the lead before the tip", () => {
  // A 7:30 PM Eastern tip on 2024-01-10 (EST), 30 minutes' lead: 7:00 PM is the latest in time.
  assert.equal(inTime("2024-01-10T19:30", "2024-01-11T00:30Z", 30), false);
  assert.equal(inTime("2024-01-10T19:01", "2024-01-11T00:30Z", 30), false);
  assert.equal(inTime("2024-01-10T19:00", "2024-01-11T00:30Z", 30), true);
  assert.equal(inTime("2024-01-10T18:30", "2024-01-11T00:30Z", 30), true);
  // The night before's report is in time for a noon tip.
  assert.equal(inTime("2024-01-09T20:30", "2024-01-10T17:00Z", 30), true);
  // Daylight time: 23:30Z on 2024-03-20 is 7:30 PM Eastern.
  assert.equal(inTime("2024-03-20T19:00", "2024-03-20T23:30Z", 30), true);
  assert.equal(inTime("2024-03-20T19:15", "2024-03-20T23:30Z", 30), false);
});
