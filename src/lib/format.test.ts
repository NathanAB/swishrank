import { test } from "node:test";
import assert from "node:assert/strict";
import { articleFor, figure, localTime, monthName, nearDay, points, signed } from "./format.ts";

test("changes carry a sign, with a real minus", () => {
  assert.deepEqual([signed(21), signed(-1322), signed(0)], ["+21", "−1,322", "0"]);
});

test("the week ahead calls today Tonight and the next day Tomorrow, across a month's end, and names no later day", () => {
  assert.deepEqual(["2026-10-31", "2026-11-01", "2026-11-02"].map((d) => nearDay(d, "2026-10-31")), ["Tonight", "Tomorrow", null]);
});

test("a month's name carries its year, so a season's two Octobers differ", () => {
  assert.deepEqual([monthName("2019-10"), monthName("2020-10")], ["October 2019", "October 2020"]);
});

test("a tip-off shows in the reader's zone, named, and with its weekday where it falls on another day than in US Eastern", () => {
  const tip = new Date("2026-11-02T00:30:00Z"); // Sun, Nov 1, 7:30 PM in New York
  assert.equal(localTime(tip, "tip", "America/New_York"), "7:30 PM EST");
  assert.equal(localTime(tip, "tip", "America/Los_Angeles"), "4:30 PM PST");
  assert.equal(localTime(tip, "tip", "Europe/Paris"), "Mon 1:30 AM GMT+1");
  assert.equal(localTime(tip, "stamp", "America/Chicago"), "Nov 1, 2026, 6:30 PM CST");
});

test("says point for one and points for more", () => {
  assert.deepEqual([points(1), points(2), points(1250)], ["1 point", "2 points", "1,250 points"]);
});

test("a figure that may be negative shows a real minus and no plus", () => {
  assert.deepEqual([figure(202), figure(0), figure(-83)], ["202", "0", "−83"]);
});

test("a count takes an where it is read with a vowel sound", () => {
  assert.deepEqual([1, 8, 11, 12, 18, 43, 80].map(articleFor), ["A", "An", "An", "A", "An", "A", "An"]);
});
