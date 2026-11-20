import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { compileExperimentalEffects } from "./effects-compiler.ts";
import { generateExperimentalEffectsRuntime } from "./effects-external-runtime.ts";

async function execute(javascript) {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["eval", javascript],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  const stderr = decoder.decode(result.stderr);
  return {
    success: result.success,
    stdout: decoder.decode(result.stdout),
    diagnostic: stderr.match(/display\.toss:\d+:\d+: RuntimeError: [^\n]+/)
      ?.[0],
  };
}

const ordinary = [
  "[] dump. [1, $True, $Nil, #key, 'a'] dump.",
  "#a bind: [0]. $a at: 0 put: $a. $a dump.",
  "#o bind: $Object clone. $o at: 'inspect' put: { 'custom' }. [$o, $o] dump.",
  "#o bind: $Object clone. $o at: 'inspect' put: { 1 }. [$o] dump.",
  "'abc' inspect print. 1 toString print. $Nil dump.",
  "#o bind: $Object clone. $o at: 'toString' put: { 'custom' }. $o print.",
];
for (const source of ordinary) {
  const expected = await execute(compile(source, "display.toss"));
  const actual = await execute(
    compileExperimentalEffects(source, "display.toss", {
      sharedDispatchTables: true,
      sharedBoundaryDelegate: true,
    }),
  );
  assert.deepEqual(actual, expected, source);
  if (!expected.success) assert.ok(expected.diagnostic, source);
}
const effectCases = [
  [
    "resumed element inspection",
    "#o bind: $Object clone. $o at: 'inspect' put: { $Effect raise: #Inspect with: $Nil }. #h bind: $Object clone. $h at: #Inspect put: { p, k -> $k value: 'item' }. { [$o, 2] dump } handleWith: $h.",
    "[item, 2]\n",
  ],
  [
    "object display suspension",
    "#o bind: $Object clone. $o at: 'toString' put: { $Effect raise: #Text with: $Nil }. #h bind: $Object clone. $h at: #Text put: { p, k -> $k value: 'displayed' }. { $o print } handleWith: $h.",
    "displayed\n",
  ],
  [
    "abandonment clears inspection state",
    "#o bind: $Object clone. #a bind: [$o]. $o at: 'inspect' put: { $Effect raise: #Stop with: $Nil }. #h bind: $Object clone. $h at: #Stop put: { p, k -> 42 }. { $a dump } handleWith: $h. $o at: 'inspect' put: { 'ok' }. $a dump.",
    "[ok]\n",
  ],
  [
    "inspection snapshots before suspension",
    "#o bind: $Object clone. #a bind: [$o, 2]. $o at: 'inspect' put: { $Effect raise: #Change with: $Nil }. #h bind: $Object clone. $h at: #Change put: { p, k -> $a at: 1 put: 9. $k value: 'first' }. { $a dump } handleWith: $h. ($a at: 1) print.",
    "[first, 2]\n9\n",
  ],
];
for (const [name, source, expected] of effectCases) {
  for (const sharedBoundaryDelegate of [false, true]) {
    const actual = await execute(
      compileExperimentalEffects(source, "display.toss", {
        sharedDispatchTables: true,
        sharedBoundaryDelegate,
      }),
    );
    assert.equal(actual.success, true, `${name}: ${actual.diagnostic}`);
    assert.equal(actual.stdout, expected, name);
  }
}
const invalidResumption =
  "#o bind: $Object clone. $o at: 'inspect' put: { $Effect raise: #Inspect with: $Nil }. #later bind: $Object clone. $later at: 'inspect' put: { 'unexpected' print. 'later' }. #h bind: $Object clone. $h at: #Inspect put: { p, k -> $k value: 1 }. { [$o, $later] dump } handleWith: $h.";
const invalidResult = await execute(
  compileExperimentalEffects(invalidResumption, "display.toss", {
    sharedBoundaryDelegate: true,
  }),
);
assert.equal(invalidResult.success, false);
assert.equal(invalidResult.stdout, "");
assert.match(invalidResult.diagnostic ?? "", /inspect must return a string/);
const runtimeOptions = {
  sharedDispatchTables: true,
  sharedBoundaryDelegate: true,
};
const runtimeImport = `data:text/javascript;base64,${
  btoa(generateExperimentalEffectsRuntime(runtimeOptions))
}`;
for (const [name, source, expected] of effectCases) {
  const actual = await execute(
    compileExperimentalEffects(source, "display.toss", {
      ...runtimeOptions,
      runtimeImport,
    }),
  );
  assert.equal(actual.success, true, `${name}: ${actual.diagnostic}`);
  assert.equal(actual.stdout, expected, name);
}
console.log(
  "PASS: cooperative display preserves ordinary behavior, effects, snapshots and abandonment",
);
