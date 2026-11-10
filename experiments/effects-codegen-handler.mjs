// Fixed-shape in-memory rewrite; neither handler syntax nor runtime is implemented.
import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
const source =
  "#base bind: $Object clone. $base at: #Missing put: { payload, resume -> $resume value: ($payload add: $self bias) }. #h bind: $base clone. $h at: 'bias' put: 10. #r bind: ([1, 2] map: { x -> $x }). ($r at: 0) print. ($r at: 1) print.";
let output = compile(source, "handler-probe.toss");
function replaceOnce(before, after) {
  assert.equal(
    output.split(before).length - 1,
    1,
    `expected one occurrence: ${before}`,
  );
  output = output.replace(before, after);
}
replaceOnce("function(arg0, arg1) {", "function*(arg0, arg1) {");
replaceOnce(
  'return send(fetchBinding("resume",',
  'return yield* send(fetchBinding("resume",',
);
replaceOnce(
  "function(arg0) {",
  `function*(arg0) {
arg0 = yield {effect: Symbol.for("Missing"), payload: arg0};`,
);
replaceOnce(
  "function map(receiver, context, block) {",
  "function* map(receiver, context, block) {",
);
replaceOnce(
  "result.push(invokeBlock(selected, [value], context));",
  "result.push(yield* invokeBlock(selected, [value], context));",
);
replaceOnce(
  "function send(receiver, message, context) {",
  `function runHandled(iterator, context) {
  const handler = fetchBinding("h", context);
  function drive(step) {
    if (step.done) return step.value;
    const {effect, payload} = step.value;
    const owner = slotOwner(handler, effect);
    if (owner === null) throw new Error("unhandled probe effect");
    let used = false;
    let active = true;
    function* resume(value) {
      if (!active || used) throw new Error("invalid resume");
      used = true;
      return drive(iterator.next(value));
    }
    try {
      const selected = invokeSlot(handler, effect, owner, [payload, resume], context);
      const result = selected.next();
      if (!result.done) throw new Error("unexpected handler yield");
      return result.value;
    } finally { active = false; }
  }
  return drive(iterator.next());
}
function send(receiver, message, context) {`,
);
replaceOnce(
  "return implementation(receiver, context, ...message.arguments);",
  `const result = implementation(receiver, context, ...message.arguments);
return type === "Array" && key === "map:" ? runHandled(result, context) : result;`,
);
const result = await new Deno.Command(Deno.execPath(), {
  args: ["eval", output],
  stdout: "piped",
  stderr: "piped",
}).output();
const decoder = new TextDecoder();
assert.equal(result.success, true, decoder.decode(result.stderr));
assert.equal(decoder.decode(result.stdout), "11\n12\n");
assert.equal(decoder.decode(result.stderr), "");
console.log(
  "PASS: generated Toss handler Block handles synthetic requests across map",
);

// An alternate case returns without resuming. Add synthetic generator cleanup
// to the patched map and explicitly close its suspended iterator.
let abandoned = output;
const caseLine = abandoned.split("\n").find((line) =>
  line.startsWith('return yield* send(fetchBinding("resume",')
);
assert.ok(caseLine);
abandoned = abandoned.replace(caseLine, "return 42;");
const mapStart = abandoned.indexOf("function* map(receiver, context, block) {");
const mapEnd = abandoned.indexOf("\n}", mapStart);
assert.ok(mapStart >= 0 && mapEnd > mapStart);
const mapCode = abandoned.slice(mapStart, mapEnd + 2)
  .replace(
    "function* map(receiver, context, block) {",
    "function* map(receiver, context, block) { try {",
  )
  .replace(/\n}$/, '\n} finally { console.log("cleanup"); }\n}');
abandoned = abandoned.slice(0, mapStart) + mapCode +
  abandoned.slice(mapEnd + 2);
const caseCompletion =
  'if (!result.done) throw new Error("unexpected handler yield");\n      return result.value;';
assert.equal(abandoned.split(caseCompletion).length - 1, 1);
abandoned = abandoned.replace(
  caseCompletion,
  `if (!result.done) throw new Error("unexpected handler yield");
      if (!used) { const closed = iterator.return(); if (!closed.done) throw new Error("cleanup suspended"); }
      return result.value;`,
);
abandoned = abandoned.split("\n").filter((line) =>
  !line.startsWith('send(send(fetchBinding("r",')
).join("\n");
const end = "})([], new Map([]));";
assert.equal(abandoned.split(end).length - 1, 1);
abandoned = abandoned.replace(
  end,
  `console.log("result", fetchBinding("r", {location: {file: "probe", line: 1, column: 1}, environment}));\n${end}`,
);
const stopped = await new Deno.Command(Deno.execPath(), {
  args: ["eval", abandoned],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(stopped.success, true, decoder.decode(stopped.stderr));
assert.equal(decoder.decode(stopped.stdout), "cleanup\nresult 42\n");
console.log("PASS: generated handler abandonment closes the cooperative map");
const cleanupFailure = abandoned.replace(
  'console.log("cleanup");',
  'throw new Error("cleanup failed");',
);
assert.notEqual(cleanupFailure, abandoned);
const failedCleanup = await new Deno.Command(Deno.execPath(), {
  args: ["eval", cleanupFailure],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(failedCleanup.success, false);
assert.equal(decoder.decode(failedCleanup.stdout), "");
assert.match(decoder.decode(failedCleanup.stderr), /cleanup failed/);
console.log("PASS: generated handler abandonment propagates a cleanup failure");
