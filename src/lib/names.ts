// Each player's name by ESPN athlete id, from src/data/players.json, which scripts/fetch-season.mjs keeps.
import raw from "../data/players.json" with { type: "json" };
import type { Athlete } from "./players.ts";

function parseNames(json: unknown): Map<Athlete, string> {
  if (typeof json !== "object" || json === null || Array.isArray(json)) throw new Error("src/data/players.json: expected { id: name }");
  return new Map(
    Object.entries(json).map(([id, name]) => {
      if (!/^\d+$/.test(id) || typeof name !== "string" || !name) throw new Error(`src/data/players.json: malformed entry ${id}`);
      return [Number(id), name];
    }),
  );
}

const NAMES = parseNames(raw);

/** ESPN's display name for a player, or undefined while the fetch has yet to find it. */
export const playerName = (athlete: Athlete): string | undefined => NAMES.get(athlete);
