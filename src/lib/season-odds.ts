// The odds the pages show, worked out once a build. The season in progress is played out from its latest day, and
// again from each day before it for the title race, each earlier day kept in the build cache (src/lib/odds.ts). A
// finished season's title race is read from src/data/odds/<season>.json, which `npm run odds` writes once the
// season is over. The odds stop at the regular season's last day: once the play-in starts they hold there.
import { addDays, dayKey, fitModel, shownLineups, type SeasonData } from "./elo.ts";
import { parseArchive } from "./injuries.ts";
import { daySeed, historyDay, oddsDay, parseHistory, RUNS, teamOdds, type OddsDay, type SeasonOdds } from "./odds.ts";
import { parseBox, usualRotations, type SeasonBox } from "./players.ts";
import { DRIFT, setupAt, simulate } from "./project.ts";
import { minutesTable, returnsOutlook } from "./returns.ts";
import { fillSeason, parseSchedule, scheduledFixtures } from "./schedule.ts";
import { allSeasons, currentSeason, seasonInputs, type SeasonView } from "./season.ts";
import { regularSeasonEnd, stage } from "./teams.ts";

const SCHEDULE_FILES = import.meta.glob<unknown>("../data/schedule/*.json", { eager: true, import: "default" });
const ODDS_FILES = import.meta.glob<unknown>("../data/odds/*.json", { eager: true, import: "default" });
const BOX_FILES = import.meta.glob<unknown>("../data/box/*.json", { eager: true, import: "default" });
const INJURY_FILES = import.meta.glob<unknown>("../data/injuries/*.json", { eager: true, import: "default" });

const boxOf = (id: string): SeasonBox => {
  const raw = BOX_FILES[`../data/box/${id}.json`];
  return raw === undefined ? { season: id, games: {} } : parseBox(raw, id);
};

/** The regular season's last day: the latest regular-season game on file, or mid-April of its second year. */
const lastRegularDay = (season: SeasonView, more: readonly { day: string }[]) =>
  [...season.model.data.games.filter((g) => stage(g.note).phase === "regular").map((g) => dayKey(g.t)), ...more.map((g) => g.day), `20${season.id.slice(5)}-04-12`]
    .reduce((a, b) => (b > a ? b : a));

let current: SeasonOdds | null | undefined;

/** The season in progress's odds after its latest day, and each day's title race before it. */
export function currentOdds(): SeasonOdds | null {
  if (current !== undefined) return current;
  const season = currentSeason();
  const m = season.model;
  const inputs = seasonInputs(season.id);
  const ended = regularSeasonEnd(m);
  const days = m.series.length ? m.series.map((s) => s.day).filter((d) => !ended || d <= ended) : [addDays(season.start, -1)];
  const today = days[days.length - 1];

  const scheduled = scheduledFixtures(m.data, parseSchedule(SCHEDULE_FILES[`../data/schedule/${season.id}.json`], season.id), m.home);
  const end = lastRegularDay(season, scheduled);
  const known = [...m.data.games.filter((g) => stage(g.note).standings), ...scheduled];
  const extra = [...scheduled, ...fillSeason(m.abbrs, known, m.home, today, end)];

  // The usual rotations without the injury report, which the returning players rejoin.
  const walked = allSeasons().filter((s) => s.id <= season.id).sort((a, b) => a.id.localeCompare(b.id)).map((s) => ({ data: s.model.data as SeasonData, box: boxOf(s.id) }));
  const previous = walked.length > 1 ? walked[walked.length - 2].box : undefined;
  const injuries = INJURY_FILES[`../data/injuries/${season.id}.json`];
  const returns = {
    model: m,
    fits: inputs ? fitModel(m.data, inputs) : [],
    usual: shownLineups(m.data, usualRotations(walked).get(season.id)),
    archive: injuries === undefined ? undefined : parseArchive(injuries, season.id),
    minutes: minutesTable(boxOf(season.id), previous),
    end,
  };
  const setup = (day: string) => setupAt(m, day, DRIFT, { outlook: returnsOutlook(returns, day), extra });

  const now = simulate(setup(today), RUNS, daySeed(today));
  const history: OddsDay[] = [...days.slice(0, -1).map((day) => historyDay(season.id, setup(day), daySeed(day))), oddsDay(today, now)];
  return (current = { day: today, teams: teamOdds(now), history });
}

/** A season's title race, day by day: the season in progress's worked out, a finished one's from its file, if it has one. */
export function oddsHistory(season: SeasonView): OddsDay[] | null {
  if (season.current) return currentOdds()?.history ?? null;
  return parseHistory(ODDS_FILES[`../data/odds/${season.id}.json`], season.id) ?? null;
}
