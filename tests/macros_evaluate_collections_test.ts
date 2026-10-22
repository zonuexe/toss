import assert from "node:assert/strict";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { evaluateMacroExpressions } from "../src/macro_evaluate.ts";
import { macroRootEnvironment } from "../src/macro_value.ts";
import { parse } from "../src/parser.ts";
import { readSyntax } from "../src/syntax_reader.ts";

function evaluate(source: string) {
  return evaluateMacroExpressions(parse(source, "collections.toss"));
}

Deno.test("Syntax dispatch exposes only kind-specific copied getters", () => {
  const environment = macroRootEnvironment();
  const syntax = readSyntax("0007", { file: "syntax.toss" });
  environment.bind(Symbol.for("tree"), syntax);
  assert.equal(
    evaluateMacroExpressions(parse("$tree kind.", "test.toss"), environment),
    Symbol.for("group"),
  );
  assert.equal(
    evaluateMacroExpressions(
      parse("$tree delimiter.", "test.toss"),
      environment,
    ),
    "",
  );
  assert.equal(
    evaluateMacroExpressions(
      parse("($tree children at: 0) spelling.", "test.toss"),
      environment,
    ),
    "0007",
  );
  const children = evaluateMacroExpressions(
    parse("$tree children.", "test.toss"),
    environment,
  );
  assert.ok(Array.isArray(children));
  children.push(null);
  assert.equal(syntax.children.length, 1);
  for (
    const source of [
      "$tree spelling.",
      "($tree children at: 0) delimiter.",
      "$tree clone.",
      "$tree at: 'kind'.",
      "$tree |> %extend().",
    ]
  ) {
    assert.throws(
      () => evaluateMacroExpressions(parse(source, "test.toss"), environment),
      TossSyntaxError,
    );
  }
});

Deno.test("fresh roots contain independent Object and Symbol values", () => {
  const first = macroRootEnvironment();
  const second = macroRootEnvironment();
  const firstObject = first.fetch(Symbol.for("Object"), {
    file: "t",
    line: 1,
    column: 1,
  });
  const secondObject = second.fetch(Symbol.for("Object"), {
    file: "t",
    line: 1,
    column: 1,
  });
  const firstSymbol = first.fetch(Symbol.for("Symbol"), {
    file: "t",
    line: 1,
    column: 1,
  });
  const secondSymbol = second.fetch(Symbol.for("Symbol"), {
    file: "t",
    line: 1,
    column: 1,
  });
  assert.notEqual(firstObject, secondObject);
  assert.notEqual(firstSymbol, secondSymbol);
});

Deno.test("Array collection callbacks snapshot, preserve identities, and validate bounds", () => {
  assert.equal(
    evaluate(
      "#xs bind: [1, 2]. ($xs filter: { n -> $xs at: 1 put: 9. $True }) at: 1.",
    ),
    2,
  );
  assert.equal(
    evaluate(
      "#xs bind: [1, 2]. $xs reduce: 0 with: { sum,n -> $sum add: $n }.",
    ),
    3,
  );
  const environment = macroRootEnvironment();
  const filtered = evaluateMacroExpressions(
    parse(
      "#o bind: ($Object clone). #xs bind: [$o]. $xs filter: { item -> $True }.",
      "collections.toss",
    ),
    environment,
  );
  assert.ok(Array.isArray(filtered));
  assert.equal(
    filtered[0],
    environment.fetch(Symbol.for("o"), {
      file: "collections.toss",
      line: 1,
      column: 1,
    }),
  );
  for (const source of ["[] map: 7", "[1] at: 1", "[1] at: -1"]) {
    assert.throws(() => evaluate(source), TossSyntaxError);
  }
});

Deno.test("Array inspection dispatches, snapshots, and cleans active paths", () => {
  assert.equal(
    evaluate(
      "#xs bind: [$Nil, 2]. #obj bind: ($Object clone |> %extend(inspect: { $xs at: 1 put: 9. 'item' })). $xs at: 0 put: $obj. $xs inspect.",
    ),
    "[item, 2]",
  );
  assert.equal(
    evaluate("#xs bind: [$Nil]. $xs at: 0 put: $xs. $xs inspect."),
    "[[...]]",
  );
  assert.throws(() => evaluate("[$Object clone] inspect."), TossSyntaxError);
  assert.equal(evaluate("[[$Nil]] inspect. [1] inspect."), "[1]");
});
