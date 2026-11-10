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

// Extend only the experimental driver with synchronous, non-suspending
// abandonment. It still does not handle thrown cleanup errors through pending
// cases, handler-raised effects, expired resume capabilities, or boundaries.
const abortDriver = `function runHandled(iterator, context) {
  const handler = fetchBinding("h", context);
  const pending = [];
  let current = iterator;
  let currentCase = null;
  let input;
  while (true) {
    const step = current.next(input);
    input = undefined;
    if (step.done) {
      if (currentCase !== null && !currentCase.used) {
        const closed = iterator.return();
        if (!closed.done) throw new Error("cleanup suspended");
      }
      if (pending.length === 0) return step.value;
      const previous = pending.pop();
      current = previous.iterator;
      currentCase = previous.caseState;
      input = step.value;
      continue;
    }
    if (step.value.kind === "resume") {
      pending.push({iterator: current, caseState: currentCase});
      current = iterator;
      currentCase = null;
      input = step.value.value;
      continue;
    }
    const {effect, payload} = step.value;
    const owner = slotOwner(handler, effect);
    if (owner === null) throw new Error("unhandled probe effect");
    const caseState = {used: false};
    function* resume(value) {
      if (caseState.used) throw new Error("invalid resume");
      caseState.used = true;
      return yield {kind: "resume", value};
    }
    current = invokeSlot(handler, effect, owner, [payload, resume], context);
    currentCase = caseState;
  }
}
`;
function useAbortDriver(code) {
  const start = code.indexOf("function runHandled(iterator, context) {");
  const end = code.indexOf(
    "function send(receiver, message, context) {",
    start,
  );
  assert.ok(start >= 0 && end > start);
  return code.slice(0, start) + abortDriver + code.slice(end);
}
const abortResult = await new Deno.Command(Deno.execPath(), {
  args: ["eval", useAbortDriver(abandoned)],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(abortResult.success, true, decoder.decode(abortResult.stderr));
assert.equal(decoder.decode(abortResult.stdout), "cleanup\nresult 42\n");
const abortFailure = await new Deno.Command(Deno.execPath(), {
  args: ["eval", useAbortDriver(cleanupFailure)],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(abortFailure.success, false);
assert.match(decoder.decode(abortFailure.stderr), /cleanup failed/);
assert.equal(decoder.decode(abortFailure.stdout), "");
const largeWithAbortDriver = await new Deno.Command(Deno.execPath(), {
  args: ["eval", useAbortDriver(manyRequests)],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(
  largeWithAbortDriver.success,
  true,
  decoder.decode(largeWithAbortDriver.stderr),
);
assert.equal(decoder.decode(largeWithAbortDriver.stdout), "10\n11\n");
console.log(
  "PASS: explicit pending-case stack handles basic abandonment and cleanup",
);
const nestedAbandonment = abandoned.replace(
  "return 42;",
  `if (arg0 === 2) return 42;\n${caseLine}`,
);
assert.notEqual(nestedAbandonment, abandoned);
const nestedAbort = await new Deno.Command(Deno.execPath(), {
  args: ["eval", useAbortDriver(nestedAbandonment)],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(nestedAbort.success, true, decoder.decode(nestedAbort.stderr));
assert.equal(decoder.decode(nestedAbort.stdout), "cleanup\nresult 42\n");
console.log(
  "PASS: later abandonment returns through an earlier resumed handler",
);
// A failure while abandoning must unwind pending handler cases. This deliberately
// exposes a remaining bug in the experimental explicit-stack driver.
let nestedCleanupFailure = cleanupFailure.replace(
  "return 42;",
  `if (arg0 === 2) return 42;\n${caseLine}`,
);
assert.notEqual(nestedCleanupFailure, cleanupFailure);
nestedCleanupFailure = nestedCleanupFailure.replace(
  "function*(arg0, arg1) {",
  "function*(arg0, arg1) { try {",
)
  .replace(
    "})(environment)]},",
    `} finally { console.log("handler cleanup", arg0); }})(environment)]},`,
  );
const missingUnwind = await new Deno.Command(Deno.execPath(), {
  args: ["eval", useAbortDriver(nestedCleanupFailure)],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(missingUnwind.success, false);
assert.match(decoder.decode(missingUnwind.stderr), /cleanup failed/);
assert.equal(decoder.decode(missingUnwind.stdout), "handler cleanup 2\n");
console.log(
  "PASS: probe exposes missing pending-handler cleanup during cleanup failure",
);
// Route failures through suspended case generators so their finally blocks run.
// Error aggregation is deliberately not implemented by this probe.
const unwindDriver = abortDriver
  .replace(
    "  while (true) {\n    const step = current.next(input);",
    `  let throwNext = false;
  while (true) {
    try {
    const step = throwNext ? current.throw(input) : current.next(input);
    throwNext = false;`,
  )
  .replace(
    "    currentCase = caseState;\n  }\n}",
    `    currentCase = caseState;
    } catch (error) {
      if (pending.length === 0) throw error;
      const previous = pending.pop();
      current = previous.iterator;
      currentCase = previous.caseState;
      input = error;
      throwNext = true;
    }
  }
}`,
  );
assert.notEqual(unwindDriver, abortDriver);
function useUnwindDriver(code) {
  const start = code.indexOf("function runHandled(iterator, context) {");
  const end = code.indexOf(
    "function send(receiver, message, context) {",
    start,
  );
  assert.ok(start >= 0 && end > start);
  return code.slice(0, start) + unwindDriver + code.slice(end);
}
const unwound = await new Deno.Command(Deno.execPath(), {
  args: ["eval", useUnwindDriver(nestedCleanupFailure)],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(unwound.success, false);
assert.match(decoder.decode(unwound.stderr), /cleanup failed/);
assert.equal(
  decoder.decode(unwound.stdout),
  "handler cleanup 2\nhandler cleanup 1\n",
);
const unwindLarge = await new Deno.Command(Deno.execPath(), {
  args: ["eval", useUnwindDriver(manyRequests)],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(unwindLarge.success, true, decoder.decode(unwindLarge.stderr));
assert.equal(decoder.decode(unwindLarge.stdout), "10\n11\n");
console.log(
  "PASS: failure reaches pending handler cleanup without recursive JS frames",
);
// A pending case's own cleanup can replace the error being propagated.
// This demonstrates why routing errors alone is not error aggregation.
const replacingCleanup = nestedCleanupFailure.replace(
  'console.log("handler cleanup", arg0);',
  'if (arg0 === 1) throw new Error("handler cleanup failed");',
);
assert.notEqual(replacingCleanup, nestedCleanupFailure);
const replacedError = await new Deno.Command(Deno.execPath(), {
  args: ["eval", useUnwindDriver(replacingCleanup)],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(replacedError.success, false);
assert.match(decoder.decode(replacedError.stderr), /handler cleanup failed/);
assert.doesNotMatch(
  decoder.decode(replacedError.stderr),
  /Error: cleanup failed/,
);
console.log("PASS: probe exposes primary error replacement by handler cleanup");

// Combine the synthetic unwind path with a per-occurrence envelope. The test
// driver prints associated failures only to demonstrate retained information.
// This does not define Toss error objects or host-boundary behavior.
const aggregationDriver = unwindDriver
  .replace(
    "  let throwNext = false;",
    `  class ProbeFailure {
    constructor(primary) { this.primary = primary; this.cleanup = []; }
  }
  let injected;
  let throwNext = false;`,
  )
  .replace(
    "    const step = throwNext ? current.throw(input) : current.next(input);",
    `    injected = throwNext ? input : undefined;
    const step = throwNext ? current.throw(input) : current.next(input);`,
  )
  .replace(
    "    } catch (error) {\n      if (pending.length === 0) throw error;",
    `    } catch (error) {
      let failure;
      if (injected instanceof ProbeFailure) {
        failure = injected;
        if (error !== injected) failure.cleanup.push(error);
      } else {
        failure = error instanceof ProbeFailure ? error : new ProbeFailure(error);
      }
      injected = undefined;
      if (pending.length === 0) {
        for (const secondary of failure.cleanup) console.error("associated", secondary.message);
        throw failure.primary;
      }`,
  )
  .replace(
    "      input = error;\n      throwNext = true;",
    "      input = failure;\n      throwNext = true;",
  );
assert.notEqual(aggregationDriver, unwindDriver);
function useAggregationDriver(code) {
  const start = code.indexOf("function runHandled(iterator, context) {");
  const end = code.indexOf(
    "function send(receiver, message, context) {",
    start,
  );
  assert.ok(start >= 0 && end > start);
  return code.slice(0, start) + aggregationDriver + code.slice(end);
}
const aggregated = await new Deno.Command(Deno.execPath(), {
  args: ["eval", useAggregationDriver(replacingCleanup)],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(aggregated.success, false);
assert.match(
  decoder.decode(aggregated.stderr),
  /associated handler cleanup failed/,
);
assert.match(decoder.decode(aggregated.stderr), /Error: cleanup failed/);
const aggregateLarge = await new Deno.Command(Deno.execPath(), {
  args: ["eval", useAggregationDriver(manyRequests)],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(
  aggregateLarge.success,
  true,
  decoder.decode(aggregateLarge.stderr),
);
assert.equal(decoder.decode(aggregateLarge.stdout), "10\n11\n");
console.log(
  "PASS: per-failure experiment retains primary and handler cleanup failures",
);

// A child handler case delegates to the Symbol-keyed parent case with %super.
const childSource = source.replace(
  "#r bind:",
  "$h at: #Missing put: { payload, resume -> %super($payload, $resume) }. #r bind:",
);
assert.notEqual(childSource, source);
let childOutput = compile(childSource, "handler-super-probe.toss");
function childReplace(before, after, expected = 1) {
  assert.equal(
    childOutput.split(before).length - 1,
    expected,
    `expected ${expected} occurrences: ${before}`,
  );
  childOutput = expected === 1
    ? childOutput.replace(before, after)
    : childOutput.replaceAll(before, after);
}
childReplace("function(arg0, arg1) {", "function*(arg0, arg1) {", 2);
childReplace(
  'return send(fetchBinding("resume",',
  'return yield* send(fetchBinding("resume",',
);
childReplace("return parentSend(", "return yield* parentSend(");
childReplace(
  "function(arg0) {",
  `function*(arg0) {
arg0 = yield {effect: Symbol.for("Missing"), payload: arg0};`,
);
childReplace(
  "function map(receiver, context, block) {",
  "function* map(receiver, context, block) {",
);
childReplace(
  "result.push(invokeBlock(selected, [value], context));",
  "result.push(yield* invokeBlock(selected, [value], context));",
);
const helperStart = output.indexOf("function runHandled(iterator, context) {");
const helperEnd = output.indexOf(
  "function send(receiver, message, context) {",
  helperStart,
);
assert.ok(helperStart >= 0 && helperEnd > helperStart);
childReplace(
  "function send(receiver, message, context) {",
  output.slice(helperStart, helperEnd) +
    "function send(receiver, message, context) {",
);
childReplace(
  "return implementation(receiver, context, ...message.arguments);",
  `const result = implementation(receiver, context, ...message.arguments);
return type === "Array" && key === "map:" ? runHandled(result, context) : result;`,
);
const handlerParent = await new Deno.Command(Deno.execPath(), {
  args: ["eval", childOutput],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(handlerParent.success, true, decoder.decode(handlerParent.stderr));
assert.equal(decoder.decode(handlerParent.stdout), "11\n12\n");
console.log(
  "PASS: generated Symbol-keyed handler case delegates with %super and child self",
);
