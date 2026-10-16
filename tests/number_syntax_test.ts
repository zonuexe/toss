import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { lex } from "../src/lexer.ts";

for (
  const source of [
    "1e3.",
    "1.5e3.",
    "0x10.",
    "1_000.",
    "12abc.",
    "+1.",
    ".5.",
    "- 1.",
    "NaN.",
    "Infinity.",
    "1" + "0".repeat(309) + ".",
  ]
) {
  Deno.test(`rejects unsupported numeric form ${source}`, () => {
    assert.throws(() => compile(source, "invalid.toss"), TossSyntaxError);
  });
}

Deno.test("invalid numeric literals retain their original start position", () => {
  assert.throws(
    () => compile("'before'.\r\n  1e3.", "invalid.toss"),
    (error: unknown) => {
      assert.ok(error instanceof TossSyntaxError);
      assert.deepEqual(error.location, {
        file: "invalid.toss",
        line: 2,
        column: 3,
      });
      return true;
    },
  );
});

Deno.test("number tokens preserve negative zero and keep the terminator", () => {
  const { tokens } = lex("-0. 1.5.", "numbers.toss");
  const [zero, period, fraction, endPeriod] = tokens;
  assert.equal(zero?.kind, "number");
  assert.ok(zero?.kind === "number" && Object.is(zero.value, -0));
  assert.equal(period?.kind, "period");
  assert.ok(fraction?.kind === "number" && fraction.value === 1.5);
  assert.equal(endPeriod?.kind, "period");
});
