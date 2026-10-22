import assert from "node:assert/strict";
import { parseSyntax } from "../src/syntax_tokens.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";

for (const source of ["$(1-2).", "$(1 -2).", "$(1- 2).", "$(1 - 2)."]) {
  Deno.test(`Syntax frontend preserves subtraction: ${source}`, () => {
    const expression = parseSyntax(source)[0];
    assert.equal(expression?.kind, "send");
    if (expression?.kind !== "send") return;
    assert.equal(expression.name, "subtract:");
    assert.equal(expression.receiver.kind, "number");
    assert.equal(expression.arguments[0]?.kind, "number");
    if (expression.arguments[0]?.kind === "number") {
      assert.equal(expression.arguments[0].value, 2);
    }
  });
}

Deno.test("Syntax frontend distinguishes subtraction and unary negation", () => {
  const expression = parseSyntax("$(1--2).")[0];
  assert.equal(expression?.kind, "send");
  if (expression?.kind !== "send") return;
  assert.equal(expression.name, "subtract:");
  const operand = expression.arguments[0];
  assert.equal(operand?.kind, "send");
  if (operand?.kind === "send") assert.equal(operand.name, "negated");
});

for (const source of ["%`[1].", "%`{1}.", "%super [1].", "%import['x']."]) {
  Deno.test(`Syntax frontend requires parenthesized macro forms: ${source}`, () => {
    assert.throws(() => parseSyntax(source), TossSyntaxError);
  });
}
