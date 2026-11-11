import assert from "node:assert/strict";
import {
  compileExperimentalEffects,
  compileExperimentalEffectsSources,
} from "./effects-compiler.ts";

async function run(source, observeCause = false) {
  const generated = compileExperimentalEffects(source, "js-boundary.toss");
  const prefix = generated.match(/^(?:import \* as [^\n]+\n)*/)?.[0] ?? "";
  const javascript = observeCause
    ? `${prefix}try { ${
      generated.slice(prefix.length)
    } } catch (error) { console.log("outer", error.message); console.log("cause", error.cause?.message); }`
    : generated;
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
const ordinary = await run("#x bind: 2. (%js(x = $x; x + 1)) print.");
assert.equal(ordinary.success, true, ordinary.stderr);
assert.equal(ordinary.stdout, "3\n");

const callbackIdentity = await run(
  "#b bind: { x -> $x } asJSCallback. (%js(a = $b, b = $b; a === b && a(7) === 7)) print.",
);
assert.equal(callbackIdentity.success, true, callbackIdentity.stderr);
assert.equal(callbackIdentity.stdout, "true\n");

const localHandler = await run(
  "#cb bind: { #h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. { $Effect raise: #A with: $Nil } handleWith: $h } asJSCallback. (%js(f = $cb; f())) print.",
);
assert.equal(localHandler.success, true, localHandler.stderr);
assert.equal(localHandler.stdout, "7\n");

const crossEffect = await run(
  "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. #cb bind: { $Effect raise: #A with: $Nil } asJSCallback. { %js(f = $cb; f()) } handleWith: $h.",
  true,
);
assert.equal(crossEffect.success, true, crossEffect.stderr);
assert.match(crossEffect.stdout, /outer .*JavaScript expression threw/);
assert.match(
  crossEffect.stdout,
  /cause .*Effect cannot cross the JavaScript boundary: #A/,
);

const crossResume = await run(
  "#h bind: $Object clone. $h at: #A put: { p, k -> #cb bind: { $k value: 2 } asJSCallback. %js(f = $cb; f()) }. { $Effect raise: #A with: $Nil } handleWith: $h.",
  true,
);
assert.equal(crossResume.success, true, crossResume.stderr);
assert.match(crossResume.stdout, /outer .*JavaScript expression threw/);
assert.match(crossResume.stdout, /cause .*Invalid resume/);

const nestedResume = await run(
  "#box bind: $Object clone. #h bind: $Object clone. $h at: #A put: { p, k -> $box at: 'resume' put: $k. %js(box = $box; box.resume(1).next()) }. { $Effect raise: #A with: $Nil } handleWith: $h.",
  true,
);
assert.equal(nestedResume.success, true, nestedResume.stderr);
assert.match(nestedResume.stdout, /cause .*Invalid resume/);

const directResume = await run(
  "#h bind: $Object clone. $h at: #A put: { p, k -> $k asJSCallback }. { $Effect raise: #A with: $Nil } handleWith: $h.",
);
assert.equal(directResume.success, false);
assert.match(
  directResume.stderr,
  /Resume cannot cross the JavaScript boundary/,
);

const cleanupCallback = await run(
  "#cb bind: { #h bind: $Object clone. $h at: #A put: { p, k -> $k value: 1 }. { $Effect raise: #A with: $Nil } handleWith: $h } asJSCallback. { 1 } ensure: { %js(f = $cb; f()) }.",
  true,
);
assert.equal(cleanupCallback.success, true, cleanupCallback.stderr);
assert.match(
  cleanupCallback.stdout,
  /cause .*Effects are not allowed during cleanup/,
);
console.log("PASS: experimental JavaScript callbacks and handler boundaries");
const callbackCleanup = await run(
  "#cb bind: { { $primary } ensure: { $cleanup } } asJSCallback. %js(f = $cb; f()).",
);
assert.equal(callbackCleanup.success, false);
assert.match(callbackCleanup.stderr, /JavaScript expression threw/);
assert.match(callbackCleanup.stderr, /Unbound name "primary"/);
assert.match(callbackCleanup.stderr, /Unbound name "cleanup"/);
console.log(
  "PASS: callback error and cleanup information survive JavaScript wrapping",
);
const ignoredArguments = await run(
  "#cb bind: { x -> $x } asJSCallback. (%js(f = $cb; f(7, 1n))) print.",
);
assert.equal(ignoredArguments.success, true, ignoredArguments.stderr);
assert.equal(ignoredArguments.stdout, "7\n");
const tooFew = await run(
  "#cb bind: { x -> $x } asJSCallback. %js(f = $cb; f()).",
  true,
);
assert.equal(tooFew.success, true, tooFew.stderr);
assert.match(
  tooFew.stdout,
  /cause .*JavaScript callback expects 1 argument\(s\), received 0/,
);
const causeIdentity = compileExperimentalEffects(
  "%js((() => { globalThis.original = {}; throw globalThis.original; })()).",
  "js-boundary.toss",
);
const causeCheck = await new Deno.Command(Deno.execPath(), {
  args: [
    "eval",
    `try { ${causeIdentity} } catch (error) { console.log(error.cause === globalThis.original); }`,
  ],
  stdout: "piped",
  stderr: "piped",
}).output();
const causeDecoder = new TextDecoder();
assert.equal(causeCheck.success, true, causeDecoder.decode(causeCheck.stderr));
assert.equal(causeDecoder.decode(causeCheck.stdout), "true\n");
console.log(
  "PASS: JavaScript callback arity and original thrown-value identity",
);
const specifier = "data:text/javascript," +
  encodeURIComponent('console.log("host first"); export const value = 7;');
const lazyJavaScriptImport = compileExperimentalEffectsSources(
  "main.toss",
  new Map([
    [
      "main.toss",
      "#unused bind: { %import('./unused.toss') }. 'entry second' print.",
    ],
    ["unused.toss", `%jsImport('${specifier}'). 'never' print. %export(0).`],
  ]),
);
const eagerHost = await new Deno.Command(Deno.execPath(), {
  args: ["eval", lazyJavaScriptImport],
  stdout: "piped",
  stderr: "piped",
}).output();
const decoder = new TextDecoder();
assert.equal(eagerHost.success, true, decoder.decode(eagerHost.stderr));
assert.equal(decoder.decode(eagerHost.stdout), "host first\nentry second\n");
const missingImport = await run(
  "'never' print. #unused bind: { %jsImport('node:toss_missing_module') }.",
);
assert.equal(missingImport.success, false);
assert.equal(missingImport.stdout, "");
assert.match(missingImport.stderr, /toss_missing_module/);
const namespaces = compileExperimentalEffectsSources(
  "main.toss",
  new Map([
    [
      "main.toss",
      "#a bind: %jsImport('node:path'). #b bind: %import('./lib.toss'). %js(xs = [$a, $b]; xs[0] === xs[1]) print.",
    ],
    ["lib.toss", "%export(%jsImport('node:path'))."],
  ]),
);
const namespaceResult = await new Deno.Command(Deno.execPath(), {
  args: ["eval", namespaces],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(
  namespaceResult.success,
  true,
  decoder.decode(namespaceResult.stderr),
);
assert.equal(decoder.decode(namespaceResult.stdout), "true\n");
assert.throws(
  () => compileExperimentalEffects("%jsImport('./relative.js').", "bad.toss"),
  /relative|specifier/i,
);
console.log("PASS: static JS import ordering, errors and namespace identity");
const hostCallSpecifier = "data:text/javascript," +
  encodeURIComponent("export function call(f) { return f(); }");
const hostCrossing = await run(
  `#host bind: %jsImport('${hostCallSpecifier}'). #h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. #cb bind: { $Effect raise: #A with: $Nil } asJSCallback. { %js(host = $host, f = $cb; host.call(f)) } handleWith: $h.`,
  true,
);
assert.equal(hostCrossing.success, true, hostCrossing.stderr);
assert.match(
  hostCrossing.stdout,
  /cause .*Effect cannot cross the JavaScript boundary: #A/,
);
console.log("PASS: imported JS callback cannot use an outer Toss handler");
