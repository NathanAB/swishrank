import { test } from "node:test";
import assert from "node:assert/strict";
import { EARLY, PARAMS } from "./elo.ts";
import { SITE } from "./site.ts";

// A tripwire, not a test of behaviour. src/pages/about.astro and the fine print of src/pages/record.astro describe the
// model in words that nothing checks: on 2026-11-12 the about page still said a win counts for more once the beaten
// team proves strong, a week after `opponents: "fixed"` ended that. When this fails, reread both pages against the
// new settings, fix what they say, and then record the new settings here.
test("the model's settings are the ones the How it works and Track record pages were last read against", () => {
  assert.equal(
    JSON.stringify({ PARAMS, EARLY, SITE }),
    '{"PARAMS":{"n0":96,"margin":{"kind":"power","q":0.5},"home":{"kind":"fixed","value":0.622},"seed":{"scale":5,"fade":120,"carry":0.7},"b2b":0.4,"players":{"a":0.08,"np":320,"halfLife":365,"rookieNp":40},"idle":"freeze","opponents":"fixed","sigma":3.194},"EARLY":{"games":5,"widen":1.21},"SITE":{"onCourt":{"ridge":1500,"halfLife":365,"boxPrior":0.5,"weight":0.12},"sigma":3.194,"widen":1.21,"roster":{"fill":-0.45}}}',
    "The model's settings changed. Reread src/pages/about.astro and the fine print of src/pages/record.astro against them, then update this string.",
  );
});
