import assert from "node:assert/strict";
import { evaluateMacroExpressions } from "../src/macro_evaluate.ts";
import { parse } from "../src/parser.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";

Deno.test("compile-time root Blocks do not borrow an available parent method", () => {
  const source =
    "#f bind: { %super() }. #base bind: ($Object clone |> %extend(m: { 7 })). #child bind: ($base clone |> %extend(m: { $f value })). $child m.";
  assert.throws(
    () => evaluateMacroExpressions(parse(source, "methods.toss")),
    (error: unknown) =>
      error instanceof TossSyntaxError &&
      /method invocation context/.test(error.reason),
  );
});

Deno.test("compile-time escaped Blocks keep their selected parent inside another method", () => {
  const source =
    "#base bind: ($Object clone |> %extend(m: { 7 })). #child bind: ($base clone |> %extend(m: { { %super() } })). #later bind: $child m. #otherBase bind: ($Object clone |> %extend(m: { 9 })). #other bind: ($otherBase clone |> %extend(m: { $later value })). $other m.";
  assert.equal(evaluateMacroExpressions(parse(source, "methods.toss")), 7);
});

for (
  const [name, source, expected] of [
    ["Nil remains shadowable", "#Nil bind: 7. $Nil.", 7],
    ["True remains shadowable", "#True bind: 'shadow'. $True.", "shadow"],
    ["False remains shadowable", "#False bind: 9. $False.", 9],
    ["empty Block returns Nil", "{} value.", null],
    ["skipped Block arity is not checked", "$False ifTrue: { x -> $x }.", null],
    [
      "zero times does not check uninvoked arity",
      "0 times: { x -> $x }.",
      null,
    ],
    [
      "pipeline input precedes explicit arguments",
      "#x bind: 1. #pair bind: { a,b -> ($a multiplyBy: 10) add: $b }. (#x bind: 2) |> $pair value: $x value:.",
      22,
    ],
    [
      "Array map observes a snapshot",
      "#xs bind: [1, 2]. ($xs map: { n -> $xs at: 1 put: 9. $n }) at: 1.",
      2,
    ],
    [
      "Object methods keep the actual receiver",
      "#a bind: ($Object clone |> %extend(n: 1, m: { $self n })). #b bind: ($a clone |> %extend(n: 7)). $b m.",
      7,
    ],
    [
      "parent calls start above the chosen slot owner",
      "#a bind: ($Object clone |> %extend(m: { 1 })). #b bind: ($a clone |> %extend(m: { %super() add: 1 })). #c bind: $b clone. $c m.",
      2,
    ],
  ] as const
) {
  Deno.test(`compile-time Toss conformance: ${name}`, () => {
    const expressions = parse(source, "evaluation.toss");
    assert.equal(evaluateMacroExpressions(expressions), expected);
  });
}
