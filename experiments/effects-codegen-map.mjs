// A deliberately narrow in-memory patch of actual generated Toss JavaScript.
// It demonstrates one cooperative path, not a compiler transformation.
import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";

const source =
  "#r bind: ([1, 2] map: { x -> $x print. $x }). ($r at: 0) print.";
let output = compile(source, "effects-map-probe.toss");
function replaceOnce(before, after) {
  assert.equal(
    output.split(before).length - 1,
    1,
    `expected one occurrence of ${before}`,
  );
  output = output.replace(before, after);
}
replaceOnce(
  "function(arg0) {",
  `function*(arg0) {
arg0 = yield {effect: "probe", payload: arg0};`,
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
  `function runProbe(iterator) {
  let step = iterator.next();
  while (!step.done) {
    if (step.value.effect !== "probe") throw new Error("unexpected effect");
    step = iterator.next(step.value.payload * 2);
  }
  return step.value;
}
function send(receiver, message, context) {`,
);
replaceOnce(
  "return implementation(receiver, context, ...message.arguments);",
  `const result = implementation(receiver, context, ...message.arguments);
  return type === "Array" && key === "map:" ? runProbe(result) : result;`,
);

const result = await new Deno.Command(Deno.execPath(), {
  args: ["eval", output],
  stdout: "piped",
  stderr: "piped",
}).output();
const decoder = new TextDecoder();
assert.equal(result.success, true, decoder.decode(result.stderr));
assert.equal(decoder.decode(result.stdout), "2\n4\n2\n");
assert.equal(decoder.decode(result.stderr), "");
// The same patch cannot consume an untransformed callback. This negative
// probe prevents mistaking this single cooperative path for compatibility.
const ordinaryCallback = output.replace(
  `function*(arg0) {
arg0 = yield {effect: "probe", payload: arg0};`,
  "function(arg0) {",
);
assert.notEqual(ordinaryCallback, output);
const incompatible = await new Deno.Command(Deno.execPath(), {
  args: ["eval", ordinaryCallback],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(incompatible.success, false);
assert.match(decoder.decode(incompatible.stderr), /not iterable/);
// Explicitly mark transformed callbacks instead of duck-typing returned Toss
// values as iterators. This adapter only addresses this map path.
function adapt(code, transformed) {
  let result = code.replace(
    "function runProbe(iterator) {",
    `const probeBlocks = new WeakSet();
function markProbe(block) { probeBlocks.add(block); return block; }
function runProbe(iterator) {`,
  ).replace(
    "result.push(yield* invokeBlock(selected, [value], context));",
    `const callbackResult = invokeBlock(selected, [value], context);
    result.push(probeBlocks.has(selected) ? yield* callbackResult : callbackResult);`,
  );
  if (transformed) {
    result = result.replace(
      "((captured) => function*(arg0)",
      "((captured) => markProbe(function*(arg0)",
    )
      .replace("})(environment)]},", "}))(environment)]},");
  }
  return result;
}
async function execute(code) {
  return await new Deno.Command(Deno.execPath(), {
    args: ["eval", code],
    stdout: "piped",
    stderr: "piped",
  }).output();
}
const adaptedEffect = await execute(adapt(output, true));
assert.equal(adaptedEffect.success, true, decoder.decode(adaptedEffect.stderr));
assert.equal(decoder.decode(adaptedEffect.stdout), "2\n4\n2\n");
const adaptedOrdinary = await execute(adapt(ordinaryCallback, false));
assert.equal(
  adaptedOrdinary.success,
  true,
  decoder.decode(adaptedOrdinary.stderr),
);
assert.equal(decoder.decode(adaptedOrdinary.stdout), "1\n2\n1\n");
console.log(
  "PASS: patched map exposes incompatibility and a marked-callback adapter handles both paths",
);
