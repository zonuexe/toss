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
function instrumentRoot(source, replacement) {
  const index = source.lastIndexOf(observer);
  assert.ok(index >= 0, "root error reporter not found");
  return source.slice(0, index) + replacement +
    source.slice(index + observer.length);
}
const observed = instrumentRoot(
  handlerFailureSource,
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
const unhandledObserved = instrumentRoot(
  unhandledSource,
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
const handlerCleanupObserved = instrumentRoot(
  handlerCleanupSource,
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
const abandonedCleanupObserved = instrumentRoot(
  abandonedCleanupSource,
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
const moduleJavaScript = await execute(
  "#f bind: %import('./lib.toss'). ($f value: 4) print.",
  "%export({ x -> %js(n = $x; n + 1) }).",
);
assert.equal(moduleJavaScript.success, true, moduleJavaScript.stderr);
assert.equal(moduleJavaScript.stdout, "5\n");
console.log("PASS: module Block uses its generated JavaScript evaluator");
const repeatedFailure = compileExperimentalEffectsSources(
  "main.toss",
  new Map([
    [
      "main.toss",
      "#a bind: { { %import('./lib.toss') } ensure: { $cleanupA } } asJSCallback. #b bind: { { %import('./lib.toss') } ensure: { $cleanupB } } asJSCallback. %js(a = $a, b = $b; (() => { try { a(); } catch (e) { console.log('FIRST', e.stack); } try { b(); } catch (e) { console.log('SECOND', e.stack); } })()).",
    ],
    ["lib.toss", "%export($missing)."],
  ]),
);
const repeatedResult = await new Deno.Command(Deno.execPath(), {
  args: ["eval", repeatedFailure],
  stdout: "piped",
  stderr: "piped",
}).output();
const repeatedText = new TextDecoder().decode(repeatedResult.stdout);
assert.equal(
  repeatedResult.success,
  true,
  new TextDecoder().decode(repeatedResult.stderr),
);
const [firstFailure, secondFailure] = repeatedText.split("SECOND ");
assert.ok(firstFailure.includes('Unbound name "cleanupA"'), repeatedText);
assert.ok(secondFailure.includes('Unbound name "cleanupB"'), repeatedText);
assert.ok(!secondFailure.includes('Unbound name "cleanupA"'), repeatedText);
console.log(
  "PASS: reused module error keeps cleanup information per invocation",
);
const cachedFailureWithCleanup = compileExperimentalEffectsSources(
  "main.toss",
  new Map([
    [
      "main.toss",
      "#a bind: { { %import('./lib.toss') } ensure: { $cleanupA } } asJSCallback. #b bind: { { %import('./lib.toss') } ensure: { $cleanupB } } asJSCallback. %js(a = $a, b = $b; (() => { let first; try { a(); } catch (e) { first = e; console.log('FIRST', e.stack); } try { b(); } catch (e) { console.log('SAME', e === first); console.log('SECOND', e.stack); } })()).",
    ],
    ["lib.toss", "%export({ $missing } ensure: { $moduleCleanup })."],
  ]),
);
const cachedCleanupResult = await new Deno.Command(Deno.execPath(), {
  args: ["eval", cachedFailureWithCleanup],
  stdout: "piped",
  stderr: "piped",
}).output();
const cachedCleanupText = new TextDecoder().decode(cachedCleanupResult.stdout);
assert.equal(
  cachedCleanupResult.success,
  true,
  new TextDecoder().decode(cachedCleanupResult.stderr),
);
assert.match(cachedCleanupText, /SAME true/);
const [beforeSecond, afterSecond] = cachedCleanupText.split("SECOND ");
assert.ok(
  beforeSecond.includes('Unbound name "moduleCleanup"') &&
    beforeSecond.includes('Unbound name "cleanupA"'),
  cachedCleanupText,
);
assert.ok(
  afterSecond.includes('Unbound name "moduleCleanup"') &&
    afterSecond.includes('Unbound name "cleanupB"'),
  cachedCleanupText,
);
assert.ok(!afterSecond.includes('Unbound name "cleanupA"'), cachedCleanupText);
console.log(
  "PASS: cached module cleanup remains while per-call cleanup is isolated and error identity is preserved",
);
const cachedHandlerContext = compileExperimentalEffectsSources(
  "main.toss",
  new Map([
    [
      "main.toss",
      "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: $Nil }. #a bind: { { %import('./lib.toss') } handleWith: $h } asJSCallback. #b bind: { %import('./lib.toss') } asJSCallback. %js(a = $a, b = $b; (() => { try { a(); } catch (e) { console.log('FIRST', e.stack); } try { b(); } catch (e) { console.log('SECOND', e.stack); } })()).",
    ],
    ["lib.toss", "%export({ $Effect raise: #A with: $Nil. $missing } value)."],
  ]),
);
const cachedContextResult = await new Deno.Command(Deno.execPath(), {
  args: ["eval", cachedHandlerContext],
  stdout: "piped",
  stderr: "piped",
}).output();
const cachedContextText = new TextDecoder().decode(cachedContextResult.stdout);
assert.equal(
  cachedContextResult.success,
  true,
  new TextDecoder().decode(cachedContextResult.stderr),
);
const [withContext, withoutContext] = cachedContextText.split("SECOND ");
assert.match(withContext, /while handling #A/);
assert.doesNotMatch(withoutContext, /while handling #A/);
console.log(
  "PASS: cached module failure does not retain a later caller's handler context",
);
const frozenFailure = compileExperimentalEffectsSources(
  "main.toss",
  new Map([
    [
      "main.toss",
      "#a bind: { { %import('./lib.toss') } ensure: { $cleanupA } } asJSCallback. #b bind: { { %import('./lib.toss') } ensure: { $cleanupB } } asJSCallback. %js(a = $a, b = $b; (() => { let first; try { a(); } catch (e) { first = e; Object.defineProperty(e, 'stack', {value: e.stack, writable: false, configurable: false}); Object.freeze(e); } try { b(); } catch (e) { console.log('SAME', e === first, e.name); } })()).",
    ],
    ["lib.toss", "%export($missing)."],
  ]),
);
const frozenResult = await new Deno.Command(Deno.execPath(), {
  args: ["eval", frozenFailure],
  stdout: "piped",
  stderr: "piped",
}).output();
const frozenText = new TextDecoder().decode(frozenResult.stdout);
assert.equal(
  frozenResult.success,
  true,
  new TextDecoder().decode(frozenResult.stderr),
);
assert.equal(frozenText, "SAME true TossRuntimeError\n");
console.log(
  "PASS: frozen cached error keeps identity across repeated callbacks",
);
const hostileStackFailure = compileExperimentalEffectsSources(
  "main.toss",
  new Map([
    [
      "main.toss",
      "#a bind: { %import('./lib.toss') } asJSCallback. #b bind: { { %import('./lib.toss') } ensure: { $cleanup } } asJSCallback. %js(a = $a, b = $b; (() => { let first; try { a(); } catch (e) { first = e; Object.defineProperty(e, 'stack', {get() { throw 99; }, configurable: false}); } try { b(); } catch (e) { console.log('SAME', e === first, e.name); } })()).",
    ],
    ["lib.toss", "%export($missing)."],
  ]),
);
const hostileStackResult = await new Deno.Command(Deno.execPath(), {
  args: ["eval", hostileStackFailure],
  stdout: "piped",
  stderr: "piped",
}).output();
const hostileStackText = new TextDecoder().decode(hostileStackResult.stdout);
assert.equal(
  hostileStackResult.success,
  true,
  new TextDecoder().decode(hostileStackResult.stderr),
);
assert.equal(hostileStackText, "SAME true TossRuntimeError\n");
console.log("PASS: hostile stack access cannot replace the cached error");
