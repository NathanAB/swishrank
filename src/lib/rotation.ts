// Expected minutes, the rotation npm run ratings scores against the usual one the site shows (docs/model-v2.md,
// How the injury report will be judged); nothing on the site reads it. A rating is the team's expected strength
// over its next 10 games: its team part plus each player's value times the minutes the team can expect from
// him over those games. Those are his usual minutes when he plays times his availability, which comes from the
// day's archived injury report when it gives his return, and otherwise from the games he has missed in a row.
// A player out for the season fades to nothing; one who missed a game keeps most of his weight.
import { finalDays, dayKey, addDays, type Abbr, type SeasonData } from "./elo.ts";
import { beforeTip, type InjuryArchive } from "./injuries.ts";
import { scaled, type Athlete, type SeasonPlayers, type SeasonRotations } from "./players.ts";

/** The team games a rating looks ahead over, and back over for a player's usual minutes. */
export const GAMES = 10;
/**
 * Appearances at his minutes per game last season, on any team, that a player's usual minutes start from, or at 0
 * for a player new to the league. 0.25 predicted a team's minutes over its next 10 games best of 0 to 5, with
 * or without last season, in all 11 finished seasons.
 */
export const PSEUDO = 0.25;

/** A player's expected share of his team's next 10 games, by the team games he has missed in a row, 0 to 9. */
export type Curve = readonly number[];
/** One season's walk: its games, box scores and, from 2026-27 on, its archived injury reports. */
export type SeasonFiles = SeasonPlayers & { injuries?: InjuryArchive };

/** A team's games with box scores: its day and each player's minutes. */
type TeamGame = { day: string; minutes: Map<Athlete, number> };

function teamGames({ data, box }: SeasonPlayers): Map<Abbr, TeamGame[]> {
  const out = new Map<Abbr, TeamGame[]>();
  for (const { day, games } of finalDays(data)) {
    for (const g of games) for (const [abbr, lines] of Object.entries(box.games[g.id] ?? {})) {
      if (lines) out.set(abbr, [...(out.get(abbr) ?? []), { day, minutes: new Map(lines.map((l) => [l[0], l[1]])) }]);
    }
  }
  return out;
}

/** Each player in a team's last GAMES games, with the games he has missed since his latest. */
function missedInRow(window: readonly TeamGame[]): Map<Athlete, number> {
  const k = new Map<Athlete, number>();
  for (let j = window.length - 1; j >= 0; j--) for (const athlete of window[j].minutes.keys()) if (!k.has(athlete)) k.set(athlete, window.length - 1 - j);
  return k;
}

/**
 * Each season's curve, learned from every other season's box scores: after each team game with GAMES more to
 * come, every player in its last GAMES games, by the games he had missed in a row, and the share of the next
 * GAMES he played. A player who never plays for the team again that season and next appears for another team,
 * or never again, left it, so he is not counted. A miss with no evidence counts as available.
 */
export function missedCurves(seasons: readonly SeasonPlayers[]): Map<string, Curve> {
  const walked = seasons.map((s) => ({ id: s.data.season, teams: teamGames(s) }));
  const appearances = new Map<Athlete, { day: string; team: Abbr }[]>();
  for (const { teams } of walked) for (const [team, games] of teams) for (const { day, minutes } of games) {
    for (const athlete of minutes.keys()) appearances.set(athlete, [...(appearances.get(athlete) ?? []), { day, team }]);
  }
  for (const list of appearances.values()) list.sort((x, y) => x.day.localeCompare(y.day));
  const tallies = walked.map(({ id, teams }) => {
    const played = new Array<number>(GAMES).fill(0), seen = new Array<number>(GAMES).fill(0);
    for (const [team, games] of teams) {
      for (let i = 0; i + GAMES < games.length; i++) {
        for (const [athlete, k] of missedInRow(games.slice(Math.max(0, i + 1 - GAMES), i + 1))) {
          if (!games.slice(i + 1).some((g) => g.minutes.has(athlete))) {
            const next = appearances.get(athlete)!.find((a) => a.day > games[i].day);
            if (next?.team !== team) continue;
          }
          played[k] += games.slice(i + 1, i + 1 + GAMES).filter((g) => g.minutes.has(athlete)).length / GAMES;
          seen[k]++;
        }
      }
    }
    return { id, played, seen };
  });
  return new Map(tallies.map(({ id }) => {
    const others = tallies.filter((t) => t.id !== id);
    return [id, Array.from({ length: GAMES }, (_, k) => {
      const seen = others.reduce((s, t) => s + t.seen[k], 0);
      return seen ? others.reduce((s, t) => s + t.played[k], 0) / seen : 1;
    })];
  }));
}

/** Each team's game days, played or to come, in order. */
function schedules(data: SeasonData): Map<Abbr, string[]> {
  const out = new Map<Abbr, string[]>();
  for (const g of [...data.games].sort((x, y) => x.t.localeCompare(y.t))) {
    for (const abbr of [g.home, g.away]) out.set(abbr, [...(out.get(abbr) ?? []), dayKey(g.t)]);
  }
  return out;
}

/**
 * The return date of each player a game day's injury report expects back: the report saved the morning after
 * the day's games, or, until that morning comes, the one saved on the day.
 */
function returns(archive: InjuryArchive | undefined, day: string): Map<Athlete, string> {
  const report = archive?.days[addDays(day, 1)] ?? archive?.days[day];
  return new Map((report?.injuries ?? []).flatMap((i) => (i.returnDate ? [[i.athlete, i.returnDate] as const] : [])));
}

/**
 * Every season's rotations. After each game day, each team that has played gets everyone in its last GAMES games
 * with box scores, each at his usual minutes times his availability, scaled so the team's total is 240.
 * Usual minutes are his minutes over those appearances plus PSEUDO games at last season's rate, over his
 * appearances plus PSEUDO. Availability is the curve at the games he has missed in a row, or, when the day's
 * report gives his return, the curve at 0 times the share of the team's next GAMES scheduled games on or after it.
 */
export function rotations(seasons: readonly SeasonFiles[], curves: ReadonlyMap<string, Curve>): Map<string, SeasonRotations> {
  const out = new Map<string, SeasonRotations>();
  let lastSeason = new Map<Athlete, number>();
  for (const season of seasons) {
    const curve = curves.get(season.data.season)!;
    const schedule = schedules(season.data);
    const reports = season.injuries && beforeTip(season.injuries, season.data.games);
    const windows = new Map<Abbr, TeamGame[]>();
    const thisSeason = new Map<Athlete, { minutes: number; games: number }>();
    const byDay: SeasonRotations = new Map();
    for (const { day, games } of finalDays(season.data)) {
      for (const g of games) for (const [abbr, lines] of Object.entries(season.box.games[g.id] ?? {})) {
        if (!lines) continue;
        windows.set(abbr, [...(windows.get(abbr) ?? []), { day, minutes: new Map(lines.map((l) => [l[0], l[1]])) }].slice(-GAMES));
        for (const l of lines) {
          const so = thisSeason.get(l[0]) ?? { minutes: 0, games: 0 };
          thisSeason.set(l[0], { minutes: so.minutes + l[1], games: so.games + 1 });
        }
      }
      const back = returns(reports, day);
      byDay.set(day, Object.fromEntries([...windows].map(([abbr, window]) => {
        const ahead = (schedule.get(abbr) ?? []).filter((d) => d > day).slice(0, GAMES);
        return [abbr, scaled([...missedInRow(window)].map(([athlete, k]) => {
          const played = window.flatMap((g) => g.minutes.get(athlete) ?? []);
          const usual = (played.reduce((s, m) => s + m, 0) + PSEUDO * (lastSeason.get(athlete) ?? 0)) / (played.length + PSEUDO);
          const from = back.get(athlete);
          const available = from !== undefined && ahead.length ? (curve[0] * ahead.filter((d) => d >= from).length) / ahead.length : curve[k];
          return { athlete, min: usual * available };
        }))];
      })));
    }
    out.set(season.data.season, byDay);
    lastSeason = new Map([...thisSeason].map(([athlete, { minutes, games }]) => [athlete, minutes / games]));
  }
  return out;
}
