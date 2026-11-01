import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const src = new URL("..", import.meta.url).pathname;
const styled = (readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.(astro|css)$/.test(f));

test("no text is held to a narrower measure than its box: the owner wants text to run the width it is given", () => {
  const capped = styled.flatMap((f) =>
    [...readFileSync(join(src, f), "utf8").matchAll(/max-(?:width|inline-size):\s*[\d.]+ch\b/g)].map((m) => `${f}: ${m[0]}`),
  );
  assert.deepEqual(capped, []);
});

test("no text is balanced, made pretty or broken by hand into shorter lines: the owner's rule in AGENTS.md", () => {
  const forced = styled.flatMap((f) =>
    [...readFileSync(join(src, f), "utf8").matchAll(/text-wrap:\s*(?:balance|pretty)|<br\s*\/?>/g)].map((m) => `${f}: ${m[0]}`),
  );
  assert.deepEqual(forced, []);
});
