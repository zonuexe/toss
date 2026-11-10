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
