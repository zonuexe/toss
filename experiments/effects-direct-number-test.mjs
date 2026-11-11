import assert from "node:assert/strict";
import {
  compileExperimentalEffects,
  compileExperimentalEffectsSources,
} from "./effects-compiler.ts";

const cases = [
  "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. ({ 1 add: ($Effect raise: #A with: $Nil) } handleWith: $h) print.",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: $p }. #o bind: $Object clone. $o at: 'call:' put: { x -> $Effect raise: #A with: $x }. (({ [1, 2] map: { x -> 1 add: ($o call: $x) } } handleWith: $h) at: 0) print.",
  "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 1 }. ({ 2 times: { $Effect raise: #A with: $Nil } } handleWith: $h) print.",
  "(1 divideBy: 0) print.",
  "(1 add: 'bad') print.",
  "#f bind: %async({ 1 add: %await(%js(Promise.resolve(2))) }) asJSCallback. %js(f = $f; f().then(v => console.log(v))).",
];
const generated = compileExperimentalEffects(
  "(1 add: 2) print. 2 times: { 1 }.",
  "direct.toss",
  { directNumberSends: true },
);
assert.match(generated, /send\(1, \{name: "add:"/);
assert.match(generated, /effectSend\(2, \{name: "times:"/);

async function execute(javascript) {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["eval", javascript],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  return {
    success: result.success,
    stdout: decoder.decode(result.stdout),
    diagnostic: decoder.decode(result.stderr).match(
      /direct\.toss:\d+:\d+: RuntimeError: [^\n]+/,
    )?.[0],
  };
}

for (const [index, source] of cases.entries()) {
  const baseline = compileExperimentalEffects(source, "direct.toss");
  const optimized = compileExperimentalEffects(source, "direct.toss", {
    directNumberSends: true,
  });
  const actual = await execute(optimized);
  assert.deepEqual(actual, await execute(baseline), source);
  if (index === 3 || index === 4) {
    assert.equal(actual.success, false, source);
    assert.match(actual.diagnostic ?? "", /RuntimeError:/, source);
  } else {
    assert.equal(actual.success, true, source);
  }
}

const sources = new Map([
  [
    "main.toss",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. ({ 1 add: %import('./lib.toss') } handleWith: $h) print.",
  ],
  ["lib.toss", "%export($Effect raise: #A with: $Nil)."],
]);
const moduleResult = await execute(
  compileExperimentalEffectsSources("main.toss", sources, {
    directNumberSends: true,
  }),
);
assert.deepEqual(
  moduleResult,
  await execute(compileExperimentalEffectsSources("main.toss", sources)),
);
assert.equal(moduleResult.success, true);
assert.equal(moduleResult.stdout, "8\n");
console.log(
  "PASS: direct numeric sends preserve effect propagation, errors, async and module initialization",
);
