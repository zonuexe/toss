// In-memory probe of module caching in actual generated Toss JavaScript.
import assert from "node:assert/strict";
import { compileSources } from "../src/compiler.ts";

const output = compileSources(
  "main.toss",
  new Map([
    [
      "main.toss",
      "#a bind: %import('./lib.toss'). #b bind: %import('./lib.toss'). $a print. $b print.",
    ],
    ["lib.toss", "'initialized' print. %export(7)."],
  ]),
);
const initializer = "moduleInitializers[1] = () => {";
assert.equal(output.split(initializer).length - 1, 1);
const changed = output.replace(
  initializer,
  "moduleInitializers[1] = function* () {",
);
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
assert.equal(baseline.stdout, "initialized\n7\n7\n");
const modified = await execute(changed);
assert.equal(modified.success, true, modified.stderr);
assert.equal(modified.stdout, "[object Object]\n[object Object]\n");
console.log(
  "PASS: generator-only module conversion caches an unexecuted iterator as its export",
);
