import assert from "node:assert/strict";
import {
  compileExperimentalEffects,
  compileExperimentalEffectsSources,
} from "./effects-compiler.ts";
import { generateExperimentalEffectsRuntime } from "./effects-external-runtime.ts";

const options = {
  sharedBoundaryDelegate: true,
  sharedDispatchTables: true,
  directNumberSends: true,
};
const dataUrl = (source) => `data:text/javascript;base64,${btoa(source)}`;
const runtimeSource = generateExperimentalEffectsRuntime(options);
const runtimeImport = dataUrl(runtimeSource);
async function execute(code) {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["eval", code],
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
const cases = [
  [
    "handled effect and cleanup",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. ({ { 1 add: ($Effect raise: #A with: $Nil) } ensure: { 'cleanup' print } } handleWith: $h) print.",
    "cleanup\n8\n",
  ],
  [
    "JS re-entry",
    "#cb bind: { #h bind: $Object clone. $h at: #I put: { p, k -> $k value: 7 }. { $Effect raise: #I with: $Nil } handleWith: $h } asJSCallback. #h bind: $Object clone. $h at: #A put: { p, k -> #v bind: %js(f = $cb; f()). $k value: $v }. ({ $Effect raise: #A with: $Nil } handleWith: $h) print.",
    "7\n",
  ],
  [
    "async local handler",
    "#f bind: %async({ %await(%js(Promise.resolve())). #h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. { $Effect raise: #A with: $Nil } handleWith: $h }) asJSCallback. %js(f = $f; f().then(v => console.log(v))).",
    "7\n",
  ],
  [
    "static JS import",
    "#p bind: %jsImport('node:path'). (%js(p = $p; p.basename('/a/b'))) print.",
    "b\n",
  ],
];
for (const [name, source, expected] of cases) {
  for (const external of [false, true]) {
    const result = await execute(
      compileExperimentalEffects(source, "external.toss", {
        ...options,
        ...(external ? { runtimeImport } : {}),
      }),
    );
    assert.equal(
      result.success,
      true,
      `${name} external=${external}: ${result.stderr}`,
    );
    assert.equal(result.stdout, expected, name);
  }
}
const sources = new Map([
  [
    "main.toss",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. ({ 1 add: %import('./lib.toss') } handleWith: $h) print.",
  ],
  ["lib.toss", "%export($Effect raise: #A with: $Nil)."],
]);
for (const external of [false, true]) {
  const result = await execute(
    compileExperimentalEffectsSources("main.toss", sources, {
      ...options,
      ...(external ? { runtimeImport } : {}),
    }),
  );
  assert.equal(result.success, true, result.stderr);
  assert.equal(result.stdout, "8\n");
}
const asyncModule = new Map([
  [
    "main.toss",
    "#f bind: %async({ %await(%js(Promise.resolve())). #h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. { %import('./lib.toss') } handleWith: $h }) asJSCallback. %js(f = $f; f().then(v => console.log(v))).",
  ],
  ["lib.toss", "%export($Effect raise: #A with: $Nil)."],
]);
for (const external of [false, true]) {
  const result = await execute(
    compileExperimentalEffectsSources("main.toss", asyncModule, {
      ...options,
      ...(external ? { runtimeImport } : {}),
    }),
  );
  assert.equal(result.success, true, result.stderr);
  assert.equal(result.stdout, "7\n");
}
const reentrantFailure = new Map([
  [
    "main.toss",
    "#b bind: { %import('./lib.toss') } asJSCallback. #a bind: { { { %import('./lib.toss') } ensure: { $innerCleanup } } ensure: { %js(f = $b; (() => { try { f(); } catch (e) {} })()) } } asJSCallback. %js(f = $a; (() => { try { f(); } catch (e) { console.log(e.stack.includes('innerCleanup')); } })()).",
  ],
  ["lib.toss", "%export($missing)."],
]);
for (const external of [false, true]) {
  const result = await execute(
    compileExperimentalEffectsSources("main.toss", reentrantFailure, {
      ...options,
      ...(external ? { runtimeImport } : {}),
    }),
  );
  assert.equal(result.success, true, result.stderr);
  assert.equal(result.stdout, "true\n");
}
const mismatch = await execute(
  compileExperimentalEffects("'never' print.", "external.toss", {
    runtimeImport,
    sharedBoundaryDelegate: false,
  }),
);
assert.equal(mismatch.success, false);
assert.equal(mismatch.stdout, "");
assert.match(
  mismatch.stderr,
  /Experimental effect runtime is missing or incompatible/,
);
const fingerprint = runtimeSource.match(/runtimeFingerprint = ("[0-9a-f]+");/)
  ?.[1];
assert.ok(fingerprint);
for (
  const factory of [
    "return null;",
    "return {};",
    "throw new Error('factory failure');",
  ]
) {
  const forgedRuntime = dataUrl(
    `export const runtimeFingerprint = ${fingerprint}; export function createEffectRuntime() { ${factory} }`,
  );
  const invalid = await execute(
    compileExperimentalEffects("'never' print.", "external.toss", {
      ...options,
      runtimeImport: forgedRuntime,
    }),
  );
  assert.equal(invalid.success, false);
  assert.equal(invalid.stdout, "");
  assert.match(
    invalid.stderr,
    /Experimental effect runtime is missing or incompatible/,
  );
}

const initialization = new Map([
  ["main.toss", "#x bind: %import('./lib.toss'). $x print."],
  ["lib.toss", "'initializing' print. %export(1)."],
]);
const artifact = compileExperimentalEffectsSources(
  "main.toss",
  initialization,
  { ...options, runtimeImport },
);
const isolate = await execute(
  `await import(${JSON.stringify(dataUrl(artifact))}); await import(${
    JSON.stringify(dataUrl(artifact + "\n// second artifact"))
  });`,
);
assert.equal(isolate.success, true, isolate.stderr);
assert.equal(isolate.stdout, "initializing\n1\ninitializing\n1\n");
console.log(
  "PASS: experimental external runtime preserves effects, boundaries, module state and version checks",
);
