import assert from "node:assert/strict";
import { compileExperimentalEffectsSources } from "./effects-compiler.ts";

async function execute(main, lib) {
  const javascript = compileExperimentalEffectsSources(
    "main.toss",
    new Map([
      ["main.toss", main],
      ["lib.toss", lib],
    ]),
  );
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["eval", javascript],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  return {
    success: result.success,
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
  };
}
const resumed = await execute(
  "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. #r bind: ({ %import('./lib.toss') } handleWith: $h). $r print. (%import('./lib.toss')) print.",
  "'initialize' print. %export($Effect raise: #A with: $Nil).",
);
assert.equal(resumed.success, true, resumed.stderr);
assert.equal(resumed.stdout, "initialize\n7\n7\n");

const abandoned = await execute(
  "#h bind: $Object clone. $h at: #A put: { p, k -> 42 }. ({ %import('./lib.toss') } handleWith: $h) print. %import('./lib.toss').",
  "'initialize' print. %export($Effect raise: #A with: $Nil).",
);
assert.equal(abandoned.success, false);
assert.equal(abandoned.stdout, "initialize\n42\n");
assert.match(abandoned.stderr, /Module initialization interrupted/);

const reentered = await execute(
  "#h bind: $Object clone. $h at: #A put: { p, k -> %import('./lib.toss') }. { %import('./lib.toss') } handleWith: $h.",
  "%export($Effect raise: #A with: $Nil).",
);
assert.equal(reentered.success, false);
assert.match(reentered.stderr, /Module initialization re-entered/);

const cleanup = await execute(
  "#h bind: $Object clone. $h at: #A put: { p, k -> 42 }. { %import('./lib.toss') } handleWith: $h.",
  "%export(({ $Effect raise: #A with: $Nil } ensure: { $cleanup })).",
);
assert.equal(cleanup.success, false);
assert.match(cleanup.stderr, /Unbound name "cleanup"/);

assert.throws(() =>
  compileExperimentalEffectsSources(
    "main.toss",
    new Map([
      ["main.toss", "#unused bind: { %import('./missing.toss') }."],
    ]),
  ), /Imported file not found/);
assert.throws(() =>
  compileExperimentalEffectsSources(
    "main.toss",
    new Map([
      ["main.toss", "%import('./lib.toss')."],
      ["lib.toss", "%export(%import('./main.toss'))."],
    ]),
  ), /cycle/i);
console.log(
  "PASS: experimental module resumption, caching, abandonment, re-entry and graph validation",
);

// Observe internal cache in the test artifact: Toss does not yet have a
// language-level catch that can import again after this failure.
const handlerFailureSource = compileExperimentalEffectsSources(
  "main.toss",
  new Map([
    [
      "main.toss",
      "#h bind: $Object clone. $h at: #A put: { p, k -> $handlerFailure }. { %import('./lib.toss') } handleWith: $h.",
    ],
    ["lib.toss", "%export($Effect raise: #A with: $Nil)."],
  ]),
);
const observer = "reportEffectFailures(error); throw error;";
assert.equal(handlerFailureSource.split(observer).length - 1, 1);
const observed = handlerFailureSource.replace(
  observer,
  'console.error("cached-same", effectModuleStates.get(1)?.error === error); reportEffectFailures(error); throw error;',
);
const cacheCheck = await new Deno.Command(Deno.execPath(), {
  args: ["eval", observed],
  stdout: "piped",
  stderr: "piped",
}).output();
const cacheError = new TextDecoder().decode(cacheCheck.stderr);
assert.equal(cacheCheck.success, false);
assert.match(cacheError, /cached-same true/);
assert.match(cacheError, /Unbound name "handlerFailure"/);
console.log("PASS: handler failure remains the cached module failure");

const unhandledSource = compileExperimentalEffectsSources(
  "main.toss",
  new Map([
    ["main.toss", "%import('./lib.toss')."],
    [
      "lib.toss",
      "%export({ $Effect raise: #A with: 'secret' } ensure: { $cleanup }).",
    ],
  ]),
);
const unhandledObserved = unhandledSource.replace(
  observer,
  'console.error("cached-same", effectModuleStates.get(1)?.error === error); reportEffectFailures(error); throw error;',
);
const unhandledCheck = await new Deno.Command(Deno.execPath(), {
  args: ["eval", unhandledObserved],
  stdout: "piped",
  stderr: "piped",
}).output();
const unhandledError = new TextDecoder().decode(unhandledCheck.stderr);
assert.equal(unhandledCheck.success, false);
assert.match(unhandledError, /cached-same true/);
assert.match(unhandledError, /Unhandled effect #A/);
assert.match(unhandledError, /Unbound name "cleanup"/);
assert.ok(!unhandledError.includes("secret"));
console.log(
  "PASS: unhandled effect remains the cached module failure with cleanup details",
);
const handlerCleanupSource = compileExperimentalEffectsSources(
  "main.toss",
  new Map([
    [
      "main.toss",
      "#h bind: $Object clone. $h at: #A put: { p, k -> $handlerFailure }. { %import('./lib.toss') } handleWith: $h.",
    ],
    [
      "lib.toss",
      "%export({ $Effect raise: #A with: $Nil } ensure: { $cleanup }).",
    ],
  ]),
);
const handlerCleanupObserved = handlerCleanupSource.replace(
  observer,
  'console.error("cached-same", effectModuleStates.get(1)?.error === error); reportEffectFailures(error); throw error;',
);
const handlerCleanupCheck = await new Deno.Command(Deno.execPath(), {
  args: ["eval", handlerCleanupObserved],
  stdout: "piped",
  stderr: "piped",
}).output();
const handlerCleanupError = new TextDecoder().decode(
  handlerCleanupCheck.stderr,
);
assert.equal(handlerCleanupCheck.success, false);
assert.match(handlerCleanupError, /cached-same true/);
const handlerFailureIndex = handlerCleanupError.indexOf(
  'Unbound name "handlerFailure"',
);
const handlerCleanupIndex = handlerCleanupError.indexOf(
  'Unbound name "cleanup"',
);
assert.ok(
  handlerFailureIndex >= 0 && handlerCleanupIndex > handlerFailureIndex,
  handlerCleanupError,
);
console.log(
  "PASS: handler failure and module cleanup preserve primary identity and order",
);
const abandonedCleanupSource = compileExperimentalEffectsSources(
  "main.toss",
  new Map([
    [
      "main.toss",
      "#h bind: $Object clone. $h at: #A put: { p, k -> 42 }. { %import('./lib.toss') } handleWith: $h.",
    ],
    [
      "lib.toss",
      "%export({ $Effect raise: #A with: $Nil } ensure: { $cleanup }).",
    ],
  ]),
);
const abandonedCleanupObserved = abandonedCleanupSource.replace(
  observer,
  'const cached = effectModuleStates.get(1)?.error; console.error("cached-interrupted", cached?.message.includes("interrupted"), effectCleanupFailures.get(cached)?.[0] === error); reportEffectFailures(error); throw error;',
);
const abandonedCleanupCheck = await new Deno.Command(Deno.execPath(), {
  args: ["eval", abandonedCleanupObserved],
  stdout: "piped",
  stderr: "piped",
}).output();
const abandonedCleanupError = new TextDecoder().decode(
  abandonedCleanupCheck.stderr,
);
assert.equal(abandonedCleanupCheck.success, false);
assert.match(abandonedCleanupError, /cached-interrupted true true/);
assert.match(abandonedCleanupError, /Unbound name "cleanup"/);
console.log(
  "PASS: abandoned initialization caches interruption with cleanup failure",
);
const functionEffect = await execute(
  "#f bind: %import('./lib.toss'). #h bind: $Object clone. $h at: #A put: { p, k -> $k value: ($p add: 1) }. ({ $f value: 4 } handleWith: $h) print.",
  "%export({ x -> $Effect raise: #A with: $x }).",
);
assert.equal(functionEffect.success, true, functionEffect.stderr);
assert.equal(functionEffect.stdout, "5\n");

const canonicalImports = await execute(
  "#a bind: %import('./dir/../lib.toss'). #b bind: %import('./lib.toss'). $a print. $b print.",
  "'once' print. %export(7).",
);
assert.equal(canonicalImports.success, true, canonicalImports.stderr);
assert.equal(canonicalImports.stdout, "once\n7\n7\n");
console.log(
  "PASS: exported Blocks propagate effects and canonical imports share initialization",
);
const moduleUnique = await execute(
  "#key bind: %import('./lib.toss'). #h bind: $Object clone. $h at: $key put: { p, k -> $k value: 11 }. ({ $Effect raise: $key with: $Nil } handleWith: $h) print.",
  "%export($Symbol generateUnique).",
);
assert.equal(moduleUnique.success, true, moduleUnique.stderr);
assert.equal(moduleUnique.stdout, "11\n");
console.log("PASS: unique Symbol effect identity survives module import");
