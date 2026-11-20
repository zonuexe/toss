import assert from "node:assert/strict";
import { createExperimentalEffectsRepl } from "./effects-repl.ts";

const output = [];
const repl = createExperimentalEffectsRepl((text) => output.push(text));
assert.deepEqual(repl.evaluate("", "empty.toss"), {
  kind: "value",
  value: null,
});
assert.equal(
  repl.evaluate(
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }.",
    "cell-1.toss",
  ).kind,
  "value",
);
const value = repl.evaluate(
  "({ $Effect raise: #A with: $Nil } handleWith: $h) print.",
  "cell-2.toss",
);
assert.equal(value.kind, "value");
assert.equal(value.value, 7);
assert.deepEqual(output, ["7"]);
assert.equal(
  repl.evaluate(
    "#o bind: $Object clone. $o at: 'inspect' put: { $Effect raise: #A with: $Nil toString }.",
    "cell-3.toss",
  ).kind,
  "value",
);
// The element's custom inspection can suspend and resume through the REPL hook.
const display = repl.evaluate(
  "$h at: #A put: { p, k -> $k value: 'item' }. { [$o] dump } handleWith: $h.",
  "cell-4.toss",
);
assert.equal(display.kind, "value");
assert.deepEqual(output, ["7", "[item]"]);

const shared = new Error("same host error");
globalThis.effectReplShared = shared;
try {
  const first = repl.evaluate(
    "{ %js((() => { throw globalThis.effectReplShared; })()) } ensure: { $firstCleanup }.",
    "first.toss",
  );
  const second = repl.evaluate(
    "{ %js((() => { throw globalThis.effectReplShared; })()) } ensure: { $secondCleanup }.",
    "second.toss",
  );
  assert.equal(first.kind, "error");
  assert.equal(second.kind, "error");
  assert.notEqual(first.error, second.error);
  assert.equal(first.error.cause, shared);
  assert.equal(second.error.cause, shared);
  assert.match(first.details.cleanup[0].message, /firstCleanup/);
  assert.match(second.details.cleanup[0].message, /secondCleanup/);
  assert.doesNotMatch(first.details.cleanup[0].message, /secondCleanup/);
  assert.ok(Object.isFrozen(first.details.cleanup));
  assert.ok(Object.isFrozen(first.details.cleanupDescriptions));
  first.details.cleanup[0].message = "mutated after capture";
  assert.match(first.details.cleanupDescriptions[0], /firstCleanup/);
  assert.match(second.details.cleanupDescriptions[0], /secondCleanup/);
} finally {
  delete globalThis.effectReplShared;
}
const traced = repl.evaluate(
  "#handler bind: $Object clone. $handler at: #Trace put: { p, k -> $missing }. { $Effect raise: #Trace with: $Nil } handleWith: $handler.",
  "trace-cell.toss",
);
assert.equal(traced.kind, "error");
assert.match(
  traced.details.handlerDescriptions[0],
  /#Trace at trace-cell\.toss:/,
);
traced.details.contexts[0].location.file = "changed.toss";
assert.match(traced.details.handlerDescriptions[0], /trace-cell\.toss:/);

const hostFailure = new Error("output failure");
const failing = createExperimentalEffectsRepl(() => {
  throw hostFailure;
});
const failed = failing.evaluate(
  "{ 'before' print } ensure: { $cleanup }.",
  "output.toss",
);
assert.equal(failed.kind, "error");
assert.match(
  failed.error.message,
  /output\.toss:1:\d+: RuntimeError: REPL output handler failed/,
);
assert.equal(failed.error.cause, hostFailure);
assert.match(failed.details.cleanup[0].message, /cleanup/);
const hidden = repl.evaluate(
  "(%js(typeof effectBoundary)) print.",
  "isolation.toss",
);
assert.equal(hidden.kind, "value");
assert.equal(output.at(-1), "undefined");
const asyncResult = repl.evaluate(
  "#work bind: %async({ %await(%js(Promise.resolve())). 'async output' print }). $work value.",
  "async-cell.toss",
);
assert.equal(asyncResult.kind, "value");
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(output.at(-1), "async output");
assert.throws(
  () => repl.evaluate("%import('./other.toss').", "unsupported.toss"),
  /do not support imports or exports/,
);
console.log(
  "PASS: experimental REPL output hook, effect display and failure snapshots",
);
