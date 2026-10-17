import assert from "node:assert/strict";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { compile } from "../src/compiler.ts";
import { execute, text } from "./helpers.ts";

for (
  const [name, source, output] of [
    [
      "precedence and associativity",
      "$(1 + 2 * 3) print. $(20 / 5 * 2) print. $(8 - 3 - 2) print.",
      "7\n8\n3\n",
    ],
    ["grouping and nested macros", "$((1 + 2) * $(3 + 1)) print.", "12\n"],
    [
      "spacing independent subtraction",
      "$(1-2) print. $(1 -2) print. $(1- 2) print. $(1 - 2) print. $(1--2) print.",
      "-1\n-1\n-1\n-1\n3\n",
    ],
    [
      "negative zero and decimal operands",
      "$(-0) print. $(-1.5 * 2) print. $(5 % 2) print.",
      "0\n-3\n1\n",
    ],
    [
      "fetches and local scope",
      "#x bind: 10. $($x - 4) print. ({ x -> $($x + 2) } value: 3) print.",
      "6\n5\n",
    ],
    [
      "primary composition",
      "[$(1 + 2), $(3 * 4)] print. { $(-2 + 5) print } value. ($(1 + 2) |> $Object at: 'answer' put:) print.",
      "[3, 12]\n3\n3\n",
    ],
    [
      "grouping, keyword arguments, and unary messages",
      "($(1 + 2)) print. (1 add: $(2 * 3)) print. $(1 + 2) negated print.",
      "3\n7\n-3\n",
    ],
    [
      "evaluation order",
      "#p bind: $Object clone. #q bind: $Object clone. #o bind: $Object clone. $p at: 'add:' put: { n -> 'inner' print. 2 }. $o at: 'add:' put: { n -> 'outer' print. $n }. $($o + $($p + $q)) print.",
      "inner\nouter\n2\n",
    ],
    [
      "ordinary signed numbers and arrow after macro",
      "$(1+2) print. -4 print. ({ n -> $n } value: 5) print.",
      "3\n-4\n5\n",
    ],
    [
      "comments and multiline expressions",
      "$(1 + // ignored + 99\n 2 * 3) print. '$(4 + 5)' print.",
      "7\n$(4 + 5)\n",
    ],
  ] as const
) {
  Deno.test(`arithmetic macro: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
  });
}

Deno.test("arithmetic macro dispatches to object methods", async () => {
  const result = await execute(
    "#o bind: $Object clone. $o at: 'add:' put: { n -> $n multiplyBy: 10 }. $($o + 2) print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "20\n");
});

for (
  const source of [
    "$(x + 1).",
    "$(1 +).",
    "$(+1).",
    "$(1 ** 2).",
    "$ (1 + 2).",
  ] as const
) {
  Deno.test(`arithmetic macro rejects unsupported syntax: ${source}`, () => {
    assert.throws(() => compile(source, "arithmetic.toss"), TossSyntaxError);
  });
}

Deno.test("arithmetic send errors use the original operator location", async () => {
  const zero = await execute("'before' print.\n  $(8 / 0) print.");
  assert.notEqual(zero.code, 0);
  assert.ok(
    text(zero.stderr).includes(
      "fixture.toss:2:7: RuntimeError: Division by zero.",
    ),
    text(zero.stderr),
  );
  const type = await execute("#x bind: 'bad'.\n  $(1 + $x) print.");
  assert.notEqual(type.code, 0);
  assert.ok(
    text(type.stderr).includes(
      "fixture.toss:2:7: RuntimeError: Number argument required.",
    ),
    text(type.stderr),
  );
});
