import assert from "node:assert/strict";
import { parse } from "../src/parser.ts";
import {
  evaluateMacroExpression,
  evaluateMacroExpressions,
} from "../src/macro_evaluate.ts";
import { invokeMacroBlock } from "../src/macro_primitive.ts";
import {
  type MacroContext,
  macroRootEnvironment,
  MacroState,
} from "../src/macro_value.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { syntaxToken } from "../src/syntax.ts";

function evaluate(source: string) {
  return evaluateMacroExpressions(parse(`${source}.`, "test.toss"));
}

Deno.test("evaluates ordinary Blocks and returns an identical Syntax input", () => {
  const expression = parse("{ syntax -> $syntax }.", "test.toss")[0];
  assert.ok(expression);
  const environment = macroRootEnvironment();
  const context: MacroContext = {
    state: new MacroState(),
    environment,
    location: expression.location,
  };
  const closure = evaluateMacroExpression(expression, context);
  const input = syntaxToken("hello", {
    location: expression.location,
    scope: { kind: "caller", id: 1 },
    trace: [],
  });
  assert.equal(invokeMacroBlock(closure, [input], context), input);
});

Deno.test("supports lexical mutation, capture by reference, and separated locals", () => {
  assert.equal(
    evaluate("#x bind: 8. #inc bind: { #x bind: ($x add: 1). $x }. $inc value"),
    9,
  );
  assert.equal(
    evaluate("#x bind: 7. { #x bind: 4. ($x add: 2) } value. $x"),
    7,
  );
});

Deno.test("supports lazy boolean branches, arbitrary arity, pipeline order, and times result", () => {
  assert.equal(evaluate("$True ifTrue: { 12 } ifFalse: { $missing }"), 12);
  assert.equal(
    evaluate("({ a,b,c -> ($a add: $b) add: $c } value: 2 value: 3 value: 4)"),
    9,
  );
  assert.equal(
    evaluate(
      "#f bind: { a,b -> ($a multiplyBy: 10) add: $b }. 2 |> $f value: 3 value:",
    ),
    32,
  );
  assert.equal(evaluate("3 times: { 42 }"), 42);
});

Deno.test("enforces finite numeric results, arity, and forbidden effects", () => {
  for (
    const source of [
      "1 divideBy: 0",
      "1 add: 'no'",
      "{} value: 1",
      "'x' print",
      "%js(1)",
      "%import('x')",
    ]
  ) {
    assert.throws(() => evaluate(source), TossSyntaxError);
  }
});

Deno.test("bounds recursive calls and long times loops", () => {
  assert.throws(
    () => evaluate("#loop bind: { $loop value }. $loop value"),
    (error: unknown) =>
      error instanceof TossSyntaxError && error.reason.includes("limit"),
  );
  assert.throws(
    () => evaluate("100001 times: {}"),
    (error: unknown) =>
      error instanceof TossSyntaxError && error.reason.includes("limit"),
  );
});
