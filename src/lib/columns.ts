// How a day's games fill a card that sets them in columns: down the first column, then the next, so tip-off
// order reads top to bottom. A day of three games or fewer stays one list in the first column.

/** The games' places, 0 to n - 1 in tip-off order, column by column, when the card sets `across` columns. */
export function columns(n: number, across: number): number[][] {
  const rows = n <= 3 ? n : Math.ceil(n / across);
  const out: number[][] = [];
  for (let i = 0; i < n; i += rows) out.push(Array.from({ length: Math.min(rows, n - i) }, (_, k) => i + k));
  return out;
}

/** Whether game i of n heads a column when the card sets two columns (h2) and three (h3), for its top rule. */
export const heads = (i: number, n: number) => ({ h2: columns(n, 2).some((c) => c[0] === i), h3: columns(n, 3).some((c) => c[0] === i) });

/** Rows per column at one, two and three columns, as the custom properties a day's list lays out by. */
export const rowVars = (n: number) => [1, 2, 3].map((a) => `--r${a}: ${columns(n, a)[0]?.length ?? 0}`).join("; ");
