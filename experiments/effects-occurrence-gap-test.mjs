// Reusing a nested cached Error must not alter an earlier failure occurrence.
import assert from "node:assert/strict";
import { compileExperimentalEffectsSources } from "./effects-compiler.ts";
import { generateExperimentalEffectsRuntime } from "./effects-external-runtime.ts";

const sources = new Map([
  [
    "main.toss",
    "#a bind: { %import('./outer.toss') } asJSCallback. #b bind: { { %import('./inner.toss') } ensure: { $callerCleanup } } asJSCallback. %js(a = $a, b = $b; (() => { try { a(); } catch (e) {} try { b(); } catch (e) {} try { a(); } catch (e) { console.log(e.stack); } })()).",
  ],
  [
    "outer.toss",
    "%export({ $outerMissing } ensure: { %import('./inner.toss') }).",
  ],
  ["inner.toss", "%export($innerMissing)."],
]);
const javascript = compileExperimentalEffectsSources("main.toss", sources, {
  sharedDispatchTables: true,
  sharedBoundaryDelegate: true,
});
const decoder = new TextDecoder();
for (const sharedBoundaryDelegate of [false, true]) {
  const base = { sharedDispatchTables: true, sharedBoundaryDelegate };
  for (const external of [false, true]) {
    const runtimeImport = `data:text/javascript;base64,${
      btoa(generateExperimentalEffectsRuntime(base))
    }`;
    const program = compileExperimentalEffectsSources(
      "main.toss",
      sources,
      external ? { ...base, runtimeImport } : base,
    );
    const result = await new Deno.Command(Deno.execPath(), {
      args: ["eval", program],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(result.success, true, decoder.decode(result.stderr));
    const output = decoder.decode(result.stdout);
    assert.match(output, /Unbound name "outerMissing"/);
    assert.match(output, /Unbound name "innerMissing"/);
    // The caller cleanup belongs to a different use of inner.toss.
    assert.doesNotMatch(output, /Unbound name "callerCleanup"/);
  }
}
console.log(
  "PASS: nested cached errors isolate cleanup metadata across occurrences",
);

// Two associated occurrences may contain the same Error identity but have
// different nested cleanup records. Traverse the records, not the Error keys.
const marker =
  'try { runEffectProgram(effectInitialize(0, {file: "<entry>", line: 1, column: 1}));';
assert.equal(javascript.split(marker).length, 2);
const probe = `{
  const primary = new Error("primary");
  const shared = new Error("shared");
  const first = new Error("first");
  const second = new Error("second");
  recordCleanupFailure(shared, first);
  recordCleanupFailure(primary, shared);
  restoreEffectFailure(shared, undefined);
  recordCleanupFailure(shared, second);
  recordCleanupFailure(primary, shared);
  const details = getEffectFailureDetails(primary).cleanup;
  if (details.length !== 4 || details[0] !== shared || details[1] !== first || details[2] !== shared || details[3] !== second) throw new Error("lost distinct nested occurrences");
}
`;
const instrumented = javascript.replace(marker, probe + marker);
const duplicateResult = await new Deno.Command(Deno.execPath(), {
  args: ["eval", instrumented],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(
  duplicateResult.success,
  true,
  decoder.decode(duplicateResult.stderr),
);
console.log(
  "PASS: shared Error identities retain separate nested cleanup records",
);
