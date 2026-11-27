import { test } from "node:test";
import assert from "node:assert/strict";
import { lastmod } from "./sitemap.ts";

test("the sitemap dates a page of the season in progress at the build, and leaves a finished season's and a fixed page undated", () => {
  const builtAt = new Date("2026-11-27T20:15:10Z");
  for (const path of ["/", "/east/", "/teams/bos/", "/games/2026-11-02/cle-at-chi/", "/odds/", "/players/", "/players/a-j-lawson-4067017/", "/record/", "/injury-report/"]) {
    assert.equal(lastmod(path, builtAt), "2026-11-27T20:15:10.000Z", path);
  }
  for (const path of ["/2015-16/", "/2015-16/teams/atl/", "/2025-26/games/2026-01-23/ind-at-okc/", "/about/", "/seasons/"]) {
    assert.equal(lastmod(path, builtAt), undefined, path);
  }
});
