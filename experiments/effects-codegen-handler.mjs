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

// The experimental recursive driver keeps a JS frame per nested resume.
// This is an implementation limit of the probe, not a Toss language limit.
const arrayLiteral = 'send([1, 2], {name: "map:"';
assert.equal(output.split(arrayLiteral).length - 1, 1);
const manyValues = Array.from({ length: 10000 }, (_, index) => index).join(
  ", ",
);
const manyRequests = output.replace(
  arrayLiteral,
  `send([${manyValues}], {name: "map:"`,
);
const stress = await new Deno.Command(Deno.execPath(), {
  args: ["eval", manyRequests],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(stress.success, false);
assert.match(decoder.decode(stress.stderr), /Maximum call stack size exceeded/);
console.log(
  "PASS: recursive handler driver overflows under many successive requests",
);

// Heap-backed experimental driver for cases that resume exactly once. It keeps
// each suspended case explicitly, so case code can continue after resume.
// It deliberately does not implement abandonment, cleanup or boundary rules.
const driverStart = manyRequests.indexOf(
  "function runHandled(iterator, context) {",
);
const driverEnd = manyRequests.indexOf(
  "function send(receiver, message, context) {",
  driverStart,
);
assert.ok(driverStart >= 0 && driverEnd > driverStart);
const iterativeDriver = `function runHandled(iterator, context) {
  const handler = fetchBinding("h", context);
  const pending = [];
  let current = iterator;
  let input;
  while (true) {
    const step = current.next(input);
    input = undefined;
    if (step.done) {
      if (pending.length === 0) return step.value;
      current = pending.pop();
      input = step.value;
      continue;
    }
    if (step.value.kind === "resume") {
      pending.push(current);
      current = iterator;
      input = step.value.value;
      continue;
    }
    const {effect, payload} = step.value;
    const owner = slotOwner(handler, effect);
    if (owner === null) throw new Error("unhandled probe effect");
    let used = false;
    function* resume(value) {
      if (used) throw new Error("invalid resume");
      used = true;
      return yield {kind: "resume", value};
    }
    current = invokeSlot(handler, effect, owner, [payload, resume], context);
  }
}
`;
const iterative = manyRequests.slice(0, driverStart) + iterativeDriver +
  manyRequests.slice(driverEnd);
const scalable = await new Deno.Command(Deno.execPath(), {
  args: ["eval", iterative],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(scalable.success, true, decoder.decode(scalable.stderr));
assert.equal(decoder.decode(scalable.stdout), "10\n11\n");
console.log(
  "PASS: explicit pending-case stack handles 10000 one-shot resumptions",
);

const smallStart = output.indexOf("function runHandled(iterator, context) {");
const smallEnd = output.indexOf(
  "function send(receiver, message, context) {",
  smallStart,
);
assert.ok(smallStart >= 0 && smallEnd > smallStart);
let afterResume = output.slice(0, smallStart) + iterativeDriver +
  output.slice(smallEnd);
const resumeLine = afterResume.split("\n").find((line) =>
  line.startsWith('return yield* send(fetchBinding("resume",')
);
assert.ok(resumeLine);
afterResume = afterResume.replace(
  resumeLine,
  `${
    resumeLine.replace("return ", "const resumedValue = ")
  }\nconsole.log("after", arg0); return resumedValue;`,
);
const continued = await new Deno.Command(Deno.execPath(), {
  args: ["eval", afterResume],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(continued.success, true, decoder.decode(continued.stderr));
assert.equal(decoder.decode(continued.stdout), "after 2\nafter 1\n11\n12\n");
console.log(
  "PASS: explicit pending-case stack returns to handler cases in nesting order",
);
