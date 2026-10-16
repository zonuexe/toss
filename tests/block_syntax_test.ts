import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";

for (
  const source of [
    "{}.",
    "{ // empty\n }.",
    "{ x -> }.",
    "{ x 'body' }.",
    "{ x, y, -> $x }.",
    "{ -> 'body' }.",
    "{ $x -> 'body' }.",
    "{ 'body'. . }.",
    "{ 'body'",
    "{ 'first' 'second' }.",
    "{ 'body' }",
    "'x' -> 'y'.",
  ]
) {
  Deno.test(`rejects malformed or unsupported block ${JSON.stringify(source)}`, () => {
    assert.throws(() => compile(source, "invalid.toss"), TossSyntaxError);
  });
}
