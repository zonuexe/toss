// Checks current Toss code generation; the patched artifact is intentionally invalid.
import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";

const source =
  "#r bind: ([1, 2] map: { x -> $x print. $x }). ($r at: 0) print.";
const output = compile(source, "effects-probe.toss");
const block = "function(arg0) {";
assert.equal(
  output.split(block).length - 1,
  1,
  "expected exactly one generated Block",
);
const modified = output.replace(block, "function*(arg0) {");

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

const baseline = await execute(output);
assert.equal(baseline.success, true, baseline.stderr);
assert.equal(baseline.stdout, "1\n2\n1\n");
const changed = await execute(modified);
assert.equal(changed.success, true, changed.stderr);
assert.equal(changed.stdout, "[object Object]\n");
console.log(
  "PASS: original Toss map works; converting only its Block breaks the actual Prelude path",
);
