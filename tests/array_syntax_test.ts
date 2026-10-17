import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";

for (
  const source of [
    "[1,].",
    "[,1].",
    "[1,,2].",
    "[1 2].",
    "[1.",
    "1].",
    "[1; 2].",
    "[1. 2].",
    "[1, 2.",
    "[1], 2.",
  ]
) {
  Deno.test(`array syntax rejects ${JSON.stringify(source)}`, () => {
    assert.throws(() => compile(source, "invalid.toss"), TossSyntaxError);
  });
}

for (const source of ["[1, 2].", "[1\n, // okay\n2].", "[{a, b -> $a}, []]."]) {
  Deno.test(`array syntax accepts ${JSON.stringify(source)}`, () => {
    assert.doesNotThrow(() => compile(source, "valid.toss"));
  });
}
