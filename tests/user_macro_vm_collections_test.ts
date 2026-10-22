import assert from "node:assert/strict";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { evaluateMacroExpressions } from "../src/macro_evaluate.ts";
import { macroRootEnvironment } from "../src/macro_value.ts";
import { parse } from "../src/parser.ts";
import { readSyntax } from "../src/syntax_reader.ts";

function evaluate(source: string) {
  return evaluateMacroExpressions(parse(source, "vm.toss"));
}

for (
  const [name, source, expected] of [
    [
      "custom setter receives extension writes",
      "#log bind: $Object clone. #target bind: ($Object clone |> %extend('at:put:': { key,value -> $log at: $key put: $value })). $target |> %extend(x: 7). $log at: 'x'.",
      7,
    ],
    [
      "custom setter controls accepted extension keys",
      "#log bind: $Object clone. #target bind: ($Object clone |> %extend('at:put:': { key,value -> $log at: 'seen' put: $key })). $target |> %extend((7): 1). $log at: 'seen'.",
      7,
    ],
    [
      "Array display dispatches inspect using a snapshot",
      "#items bind: [$Nil, 2]. #obj bind: ($Object clone |> %extend(inspect: { $items at: 1 put: 9. 'item' })). $items at: 0 put: $obj. $items inspect.",
      "[item, 2]",
    ],
    [
      "Array inspection handles direct cycles",
      "#items bind: [$Nil]. $items at: 0 put: $items. $items inspect.",
      "[[...]]",
    ],
  ] as const
) {
  Deno.test(`compile-time collection conformance: ${name}`, () => {
    assert.equal(evaluate(source), expected);
  });
}

for (const source of ["[$Object clone] inspect.", "[{}] inspect."]) {
  Deno.test(`compile-time Array display has no invented representations: ${source}`, () => {
    assert.throws(() => evaluate(source), TossSyntaxError);
  });
}

Deno.test("compile-time Syntax messages inspect immutable source nodes", () => {
  const environment = macroRootEnvironment();
  const tree = readSyntax("0007", { file: "syntax.toss" });
  environment.bind(Symbol.for("s"), tree);
  assert.equal(
    evaluateMacroExpressions(parse("$s kind.", "vm.toss"), environment),
    Symbol.for("group"),
  );
  assert.equal(
    evaluateMacroExpressions(
      parse("($s children at: 0) spelling.", "vm.toss"),
      environment,
    ),
    "0007",
  );
  evaluateMacroExpressions(
    parse("($s children) at: 0 put: $Nil.", "vm.toss"),
    environment,
  );
  assert.equal(tree.children[0]?.kind, "token");
  for (
    const source of [
      "$s spelling.",
      "($s children at: 0) children.",
      "$s at: 'children' put: [].",
      "$s |> %extend().",
    ]
  ) {
    assert.throws(
      () => evaluateMacroExpressions(parse(source, "vm.toss"), environment),
      TossSyntaxError,
    );
  }
});
