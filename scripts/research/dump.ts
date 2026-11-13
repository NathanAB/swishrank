// node scripts/research/dump.ts <out.json>: every final game as version 4 and version 3 priced it, split into its
// parts, beside the Vegas chance, the result and each side's team box totals. Research only; nothing reads its output.
import { readFileSync, writeFileSync } from "node:fs";
import { dayKey, expected, fitSeason, playerPart, PARAMS, seasonRule, secondNights, type SeasonData, type SeasonInputs } from "../../src/lib/elo.ts";
import { parseArchive } from "../../src/lib/injuries.ts";
import { modelInputs } from "../../src/lib/inputs.ts";
import { parseNbaArchive, type NbaArchive } from "../../src/lib/nba-report.ts";
import { boxRatings, gameScore, lineups, parseBox, type BoxRatings, type SeasonBox } from "../../src/lib/players.ts";
import { reportLineups } from "../../src/lib/report-lineup.ts";
import { availability, topThreeStart, V4, type Availability } from "../../src/lib/v4.ts";
import type { DraftFile } from "../../src/lib/draft.ts";
import { loadVegas } from "../vegas.ts";

const read = (path: string): unknown => {
  try { return JSON.parse(readFileSync(new URL(`../../src/data/${path}`, import.meta.url), "utf8")); } catch { return undefined; }
};
const listed = read("seasons.json") as { id: string }[];
const ALL = listed.map((s) => s.id).sort();
const draft = read("draft.json") as DraftFile;
const files = ALL.map((id) => ({ data: read(`games/${id}.json`) as SeasonData, box: read(`box/${id}.json`), preseason: read(`preseason/${id}.json`), injuries: read(`injuries/${id}.json`) }));
const inputs = modelInputs(files);
const walked = files.map((f) => ({ data: f.data, box: f.box === undefined ? { season: f.data.season, games: {} } : parseBox(f.box, f.data.season) }));
const reports = new Map<string, NbaArchive>();
for (const id of ALL) { const raw = read(`nba-reports/${id}.json`); if (raw !== undefined) reports.set(id, parseNbaArchive(raw, id)); }
const espn = new Map(files.flatMap((f) => (f.injuries === undefined ? [] : [[f.data.season, parseArchive(f.injuries, f.data.season)] as const])));
const vegas: Record<string, number> = Object.assign({}, ...ALL.map((id) => loadVegas(id).chances));

const fallbackOf = (recent: number) => {
  const previous = lineups(walked, recent);
  return (season: string) => reportLineups(walked.find((w) => w.data.season === season)!.data, previous.get(season)!.previous, espn.get(season));
};
const topThree = boxRatings(walked, PARAMS.players.halfLife, topThreeStart(walked, new Map(ALL.map((id) => [id, inputs.get(id)!.players!.rookies!])), draft));
const v4Lineups = availability(walked, reports, fallbackOf(V4.recent));
const v3Lineups = new Map(ALL.map((id) => [id, fallbackOf(10)(id)]));
const v3Ratings = boxRatings(walked, PARAMS.players.halfLife);
const atTip = lineups(walked, V4.recent);

const out: Record<string, unknown>[] = [];
for (const { data, box } of walked) {
  const inp = inputs.get(data.season)!;
  const players = inp.players!;
  const rule = seasonRule(inp);
  const make = (a: Availability | undefined, ratings: BoxRatings, lu: SeasonInputs["players"] extends infer P ? any : never): SeasonInputs => ({
    centres: inp.centres,
    players: { box: box as SeasonBox, ratings, lineups: lu, rookies: players.rookies },
    extra: a?.extra,
  });
  const a4 = v4Lineups.get(data.season)!;
  const days4 = fitSeason(data, rule, make(a4, topThree.get(data.season)!, a4.lineups));
  const days3 = fitSeason(data, rule, make(undefined, v3Ratings.get(data.season)!, v3Lineups.get(data.season)!));
  // Version 4's fit, each game priced with the players who in fact played: the ceiling on knowing who plays.
  const tip = atTip.get(data.season)!.atTip;
  const e3 = new Map(days3.flatMap((d) => d.games.map((pg) => [pg.game.id, expected(d.before, pg)] as const)));
  const second = secondNights(data);
  const last = new Map<string, string>();
  const playedN: Record<string, number> = Object.fromEntries(Object.keys(data.teams).map((t) => [t, 0]));
  const first = days4[0]?.day;
  // Everyone with a box line for each team at any point of the season: the values a lineup projection may need.
  const teamAthletes = new Map<string, Set<number>>();
  for (const sides of Object.values((box as SeasonBox).games)) for (const [abbr, ls] of Object.entries(sides)) for (const l of ls ?? []) teamAthletes.set(abbr, (teamAthletes.get(abbr) ?? new Set()).add(l[0]));
  const r4 = topThree.get(data.season)!;
  const ratingIndex = new Map(r4.athletes.map((a, j) => [a, j]));
  const prevLu = atTip.get(data.season)!.previous;
  let ratingBefore = r4.start;
  for (const { day, games, before } of days4) {
    for (const pg of games) {
      const g = pg.game;
      const lines = (box as SeasonBox).games[g.id] ?? {};
      const tot = (abbr: string) => {
        const t = new Array(12).fill(0);
        for (const l of lines[abbr] ?? []) for (let i = 0; i < 12; i++) t[i] += l[i + 2];
        return t;
      };
      const centre = (a: number) => { const j = ratingIndex.get(a); return j === undefined ? 0 : PARAMS.players.a * ratingBefore[j]; };
      const slots = (lu: readonly { athlete: number; share: number }[]) => lu.map((p) => [p.athlete, +p.share.toFixed(4), +(before.v.get(p.athlete) ?? 0).toFixed(4), +centre(p.athlete).toFixed(4)]);
      const actual = (abbr: string) => (lines[abbr] ?? []).map((l) => [l[0], l[1], +(before.v.get(l[0]) ?? 0).toFixed(4), +gameScore(l).toFixed(1)]);
      const values = (abbr: string) => [...(teamAthletes.get(abbr) ?? [])].map((x) => [x, +(before.v.get(x) ?? 0).toFixed(4)]);
      const rest = (abbr: string) => { const d = last.get(abbr); return d ? Math.round((Date.parse(day) - Date.parse(d)) / 86_400_000) : 99; };
      const s = second.get(g.id)!;
      const miss = a4.missing.get(g.id) ?? { home: 0, away: 0 };
      out.push({
        id: g.id, season: data.season, t: g.t, day, d: Math.round((Date.parse(day) - Date.parse(first!)) / 86_400_000),
        home: g.home, away: g.away, hs: g.hs, as: g.as, neutral: g.neutral, note: g.note,
        e4: expected(before, pg), e3: e3.get(g.id),
        eTip: expected(before, { ...pg, b2b: pg.b2b - (a4.extra.get(g.id) ?? 0), lineup: tip.get(g.id)! }),
        rh: before.r[g.home], ra: before.r[g.away], homeEdge: g.neutral ? 0 : before.home,
        pph: playerPart(before, pg.lineup.home), ppa: playerPart(before, pg.lineup.away),
        b2bh: s.home, b2ba: s.away, extra: a4.extra.get(g.id) ?? 0, missh: miss.home, missa: miss.away,
        resth: rest(g.home), resta: rest(g.away), kh: playedN[g.home], ka: playedN[g.away],
        vegas: vegas[g.id] ?? null, boxh: tot(g.home), boxa: tot(g.away),
        // Each side's priced lineup [athlete, share, value, prior centre], its previous game's lineup, and who played [athlete, minutes, value, game score].
        luh: slots(pg.lineup.home), lua: slots(pg.lineup.away), prevh: slots(prevLu.get(g.id)!.home), preva: slots(prevLu.get(g.id)!.away),
        acth: actual(g.home), acta: actual(g.away), valh: values(g.home), vala: values(g.away), seedh: inp.centres?.[g.home] ?? 0, seeda: inp.centres?.[g.away] ?? 0,
        covered: Number(!!reports.get(data.season)?.games[g.id]?.home) + Number(!!reports.get(data.season)?.games[g.id]?.away),
      });
    }
    ratingBefore = r4.after.get(day)!;
    for (const { game: g } of games) { playedN[g.home]++; playedN[g.away]++; last.set(g.home, dayKey(g.t)); last.set(g.away, dayKey(g.t)); }
  }
  console.error(data.season, days4.length);
}
writeFileSync(process.argv[2], JSON.stringify(out));
console.error(`${out.length} games`);
