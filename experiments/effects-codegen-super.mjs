// Deliberately narrow in-memory rewrite of actual Toss method code generation.
import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";

const source =
  "#p bind: $Object clone. $p at: 'score:' put: { n -> $n add: $self base }. #c bind: $p clone. $c at: 'base' put: 5. $c at: 'score:' put: { n -> %super($n) add: 2 }. ($c score: 3) print.";
const baseline = compile(source, "super-probe.toss");
let output = baseline;
function replaceOnce(before, after) {
  assert.equal(
    output.split(before).length - 1,
    1,
    `expected one occurrence: ${before}`,
  );
  output = output.replace(before, after);
}
assert.equal(output.split("function(arg0) {").length - 1, 2);
output = output.replaceAll("function(arg0) {", "function*(arg0) {");
assert.equal(output.split("function*(arg0) {").length - 1, 2);
output = output.replace(
  "function*(arg0) {",
  `function*(arg0) {
arg0 = yield {effect: "probe", payload: arg0};`,
);
replaceOnce("return send(parentSend(", "return send((yield* parentSend(");
replaceOnce(
  '}, scope), {name: "add:", arguments: [2]}',
  '}, scope)), {name: "add:", arguments: [2]}',
);
replaceOnce(
  "const environment = {bindings: new Map()",
  `function runProbe(iterator) {
  let step = iterator.next();
  while (!step.done) {
    if (step.value.effect !== "probe") throw new Error("unexpected effect");
    step = iterator.next(step.value.payload * 2);
  }
  return step.value;
}
const environment = {bindings: new Map()`,
);
const lines = output.split("\n");
const lineIndex = lines.findIndex((line) =>
  line.startsWith('send(send(fetchBinding("c",') &&
  line.includes('{name: "score:"')
);
assert.notEqual(lineIndex, -1);
let entry = lines[lineIndex].replace("send(send(", "send(runProbe(send(");
const printMarker = '), {name: "print", arguments: []}';
assert.equal(entry.split(printMarker).length - 1, 1);
entry = entry.replace(printMarker, ')), {name: "print", arguments: []}');
lines[lineIndex] = entry;
output = lines.join("\n");
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
const original = await execute(baseline);
assert.equal(original.success, true, original.stderr);
assert.equal(original.stdout, "10\n");
const transformed = await execute(output);
assert.equal(transformed.success, true, transformed.stderr);
assert.equal(transformed.stdout, "13\n");
console.log(
  "PASS: generated inherited parent method resumes with actual receiver",
);
const uncooperative = output.replace(
  "return send((yield* parentSend(",
  "return send((parentSend(",
);
assert.notEqual(uncooperative, output);
const failed = await execute(uncooperative);
assert.equal(failed.success, false);
assert.match(failed.stderr, /Unknown message .*add:.* for Object/);
console.log(
  "PASS: untransformed parent call fails instead of propagating suspension",
);
