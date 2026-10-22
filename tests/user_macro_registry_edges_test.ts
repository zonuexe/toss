import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, text } from "./helpers.ts";

for (const source of ["1", ".", "1..2.", ".5.", "%macro (#id, { s -> $s })."]) {
  Deno.test(`macro program parsing preserves rejected grammar: ${source}`, () => {
    assert.throws(() => compile(source, "grammar.toss"), TossSyntaxError);
  });
}

for (
  const [argument, suffix, expected] of [
    ["[1, 2]", "dump", "[1, 2]\n"],
    ["{ 7 }", "value print", "7\n"],
    ["(1 add: 2)", "print", "3\n"],
  ] as const
) {
  Deno.test(`macro output preserves a returned ${argument} group`, async () => {
    const result = await execute(
      `%macro(#first, { s -> $s children at: 0 }). %first(${argument}) ${suffix}.`,
    );
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), expected);
  });
}
