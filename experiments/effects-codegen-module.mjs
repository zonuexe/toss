// Narrow in-memory experiment on a real two-module Toss compilation.
import assert from "node:assert/strict";
import { compileSources } from "../src/compiler.ts";

let output = compileSources(
  "main.toss",
  new Map([
    [
      "main.toss",
      "#a bind: %import('./lib.toss'). #b bind: %import('./lib.toss'). $a print. $b print.",
    ],
    ["lib.toss", "'initialized' print. %export(7)."],
  ]),
);
function replaceOnce(before, after) {
  assert.equal(
    output.split(before).length - 1,
    1,
    `expected one occurrence: ${before}`,
  );
  output = output.replace(before, after);
}
replaceOnce(
  "function initializeModule(id, location) {",
  "function* initializeModule(id, location) {",
);
replaceOnce(
  "const value = moduleInitializers[id]();",
  "const value = yield* moduleInitializers[id]();",
);
replaceOnce(
  "moduleInitializers[0] = () => {",
  "moduleInitializers[0] = function* () {",
);
replaceOnce(
  "moduleInitializers[1] = () => {",
  `moduleInitializers[1] = function* () {
yield {effect: "probe"};`,
);
const importPattern =
  /initializeModule\(moduleImports\.get\("\.\/lib\.toss"\), \{location: \{"file":"main\.toss","line":1,"column":\d+\}, environment: environment\}\.location\)/g;
assert.equal([...output.matchAll(importPattern)].length, 2);
output = output.replace(importPattern, "(yield* $&)");
replaceOnce(
  'initializeModule(0, {file: "<entry>", line: 1, column: 1});',
  `function runProbe(iterator) {
  let step = iterator.next();
  while (!step.done) {
    if (step.value.effect !== "probe") throw new Error("unexpected effect");
    if (moduleStates.get(1)?.state !== "running") throw new Error("module is not running");
    let reentered = false;
    try { initializeModule(1, {file: "probe", line: 1, column: 1}).next(); }
    catch (error) { reentered = error.message.includes("re-entered"); }
    if (!reentered) throw new Error("missing re-entry error");
    console.log("handled");
    step = iterator.next();
  }
  return step.value;
}
runProbe(initializeModule(0, {file: "<entry>", line: 1, column: 1}));`,
);
const result = await new Deno.Command(Deno.execPath(), {
  args: ["eval", output],
  stdout: "piped",
  stderr: "piped",
}).output();
const decoder = new TextDecoder();
assert.equal(result.success, true, decoder.decode(result.stderr));
assert.equal(decoder.decode(result.stdout), "handled\ninitialized\n7\n7\n");
assert.equal(decoder.decode(result.stderr), "");
// The naive patch has no interruption transition when an outer handler abandons
// the suspended generator. Verify that a later import is incorrectly re-entered.
const completion =
  'runProbe(initializeModule(0, {file: "<entry>", line: 1, column: 1}));';
assert.equal(output.split(completion).length - 1, 1);
const abandoned = output.replace(
  "    step = iterator.next();",
  "    step = iterator.return();",
)
  .replace(
    completion,
    `${completion}
try { initializeModule(1, {file: "probe", line: 1, column: 1}).next(); }
catch (error) { console.log(error.message.includes("re-entered") ? "incorrectly running" : "unexpected"); }`,
  );
assert.notEqual(abandoned, output);
const aborted = await new Deno.Command(Deno.execPath(), {
  args: ["eval", abandoned],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(aborted.success, true, decoder.decode(aborted.stderr));
assert.equal(decoder.decode(aborted.stdout), "handled\nincorrectly running\n");
console.log(
  "PASS: generated module resumes and caches, while naive abandonment leaves it running",
);

// This additional in-memory patch demonstrates only the no-cleanup-error
// interruption transition. It is not a general module implementation.
const catchClause =
  "catch (error) { moduleStates.set(id, {state: 'failed', error}); throw error; }";
assert.equal(abandoned.split(catchClause).length - 1, 1);
const corrected = abandoned.replace(
  catchClause,
  `${catchClause}
finally {
  if (moduleStates.get(id)?.state === 'running') {
    moduleStates.set(id, {state: 'failed', error: new TossRuntimeError('Module initialization interrupted.', location)});
  }
}`,
)
  .replace(
    'error.message.includes("re-entered") ? "incorrectly running" : "unexpected"',
    'error.message.includes("interrupted") ? "interrupted" : "unexpected"',
  );
const interrupted = await new Deno.Command(Deno.execPath(), {
  args: ["eval", corrected],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(interrupted.success, true, decoder.decode(interrupted.stderr));
assert.equal(decoder.decode(interrupted.stdout), "handled\ninterrupted\n");
console.log(
  "PASS: explicit abandonment transition caches interruption in generated module path",
);
const correctedNormal = corrected.replace(
  "    step = iterator.return();",
  "    step = iterator.next();",
);
assert.notEqual(correctedNormal, corrected);
const completed = await new Deno.Command(Deno.execPath(), {
  args: ["eval", correctedNormal],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(completed.success, true, decoder.decode(completed.stderr));
assert.equal(decoder.decode(completed.stdout), "handled\ninitialized\n7\n7\n");
console.log(
  "PASS: explicit interruption transition preserves normal module completion",
);

// Explicitly relay abandonment into the generated module state machine.
// The synthetic cleanup is intentionally a single JavaScript error.
const moduleHeader = "function* initializeModule(id, location) {";
const originalEnd = `${catchClause}\n}`;
assert.equal(abandoned.split(moduleHeader).length - 1, 1);
assert.equal(abandoned.split(originalEnd).length - 1, 1);
const cleanupAbandonment = abandoned
  .replace(
    moduleHeader,
    `function initializeModule(id, location) {
  let abandoning = false;
  const iterator = (function* () {`,
  )
  .replace(
    originalEnd,
    `catch (error) {
  if (abandoning) {
    const interruption = new TossRuntimeError('Module initialization interrupted.', location);
    interruption.cleanup = [error];
    moduleStates.set(id, {state: 'failed', error: interruption});
  } else {
    moduleStates.set(id, {state: 'failed', error});
  }
  throw error;
} finally {
  if (moduleStates.get(id)?.state === 'running') {
    moduleStates.set(id, {state: 'failed', error: new TossRuntimeError('Module initialization interrupted.', location)});
  }
}
})();
return {
  [Symbol.iterator]() { return this; },
  next(value) { return iterator.next(value); },
  throw(error) { return iterator.throw(error); },
  return(value) { abandoning = true; return iterator.return(value); },
};
}`,
  )
  .replace(
    'yield {effect: "probe"};',
    'try { yield {effect: "probe"}; } finally { throw new Error("cleanup failed"); }',
  )
  .replace(
    completion,
    `try { ${completion} } catch (error) { console.log("primary " + error.message); }`,
  )
  .replace(
    'error.message.includes("re-entered") ? "incorrectly running" : "unexpected"',
    'error.message.includes("interrupted") && error.cleanup?.[0]?.message === "cleanup failed" ? "interrupted with cleanup" : "unexpected"',
  );
const failedCleanup = await new Deno.Command(Deno.execPath(), {
  args: ["eval", cleanupAbandonment],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(failedCleanup.success, true, decoder.decode(failedCleanup.stderr));
assert.equal(
  decoder.decode(failedCleanup.stdout),
  "handled\nprimary cleanup failed\ninterrupted with cleanup\n",
);
console.log(
  "PASS: generated module abandonment preserves cleanup failure and caches interruption",
);
