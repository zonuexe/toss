import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";

const valid = [
  "%super()",
  "%super(1)",
  "%super(1, 'two', $x add: 3)",
  "(%super(1) negated) print",
  "#super",
  "%super([1,2], { x,y -> $x })",
] as const;

for (const source of valid) {
  Deno.test(`%super syntax accepts ${source}`, () => {
    assert.doesNotThrow(() => compile(`${source}.`, "valid.toss"));
  });
}

const invalid = [
  "%super",
  "%super (1)",
  "%super(1",
  "%super(,)",
  "%super(1,)",
  "%super(,1)",
  "%super(1,,2)",
  "%super(1. 2)",
  "$ (%super())",
  "$(%super())",
] as const;

for (const source of invalid) {
  Deno.test(`%super syntax rejects ${source}`, () => {
    assert.throws(() => compile(`${source}.`, "invalid.toss"), TossSyntaxError);
  });
}
