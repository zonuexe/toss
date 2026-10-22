import assert from "node:assert/strict";
import { evaluateMacroExpressions } from "../src/macro_evaluate.ts";
import { macroRootEnvironment } from "../src/macro_value.ts";
import { parse } from "../src/parser.ts";

function evaluate(source: string) {
  return evaluateMacroExpressions(parse(source, "methods.toss"));
}

Deno.test("inherited method uses the actual receiver", () => {
  assert.equal(
    evaluate(
      "#p bind: ($Object clone |> %extend(x: 1, m: { $self x })). #c bind: $p clone. $c at: 'x' put: 2. $c m.",
    ),
    2,
  );
});

Deno.test("moved and shared method Blocks receive each dispatch receiver", () => {
  assert.deepEqual(
    evaluate(
      "#shared bind: { $self x }. #a bind: ($Object clone |> %extend(x: 3, m: $shared)). #b bind: ($Object clone |> %extend(x: 7, m: $shared)). [$a m, $b m].",
    ),
    [3, 7],
  );
});

Deno.test("parent lookup starts above the selected owner", () => {
  assert.equal(
    evaluate(
      "#base bind: ($Object clone |> %extend(m: { 1 })). #middle bind: $base clone. #child bind: ($middle clone |> %extend(m: { (%super() add: 1) })). #leaf bind: $child clone. $leaf m.",
    ),
    2,
  );
});

Deno.test("escaped method Block retains captured parent context", () => {
  assert.equal(
    evaluate(
      "#base bind: ($Object clone |> %extend(m: { 4 })). #child bind: ($base clone |> %extend(m: { { %super() } })). #later bind: $child m. $later value.",
    ),
    4,
  );
});

Deno.test("root Block calls do not inherit caller method context", () => {
  assert.throws(() =>
    evaluate(
      "#f bind: { %super() }. #o bind: ($Object clone |> %extend(m: { $f value })). $o m.",
    )
  );
});

Deno.test("parameter self shadows binding but parent call keeps receiver", () => {
  assert.deepEqual(
    evaluate(
      "#base bind: ($Object clone |> %extend(name: 8, 'm:': { $self name })). #child bind: ($base clone |> %extend('m:': { self -> [%super(), $self] })). $child m: 3.",
    ),
    [8, 3],
  );
});

Deno.test("dynamic String and Symbol selectors preserve key identity", () => {
  assert.deepEqual(
    evaluate(
      "#key bind: $Symbol generateUnique. #o bind: ($Object clone |> %extend(value: 2, ($key): 9)). [$o perform: 'value', $o perform: $key].",
    ),
    [2, 9],
  );
});

Deno.test("own prelude selector overrides Object fallback", () => {
  assert.deepEqual(
    evaluate(
      "#o bind: ($Object clone |> %extend(clone: { 'custom' }, 'at:': { k -> 'custom-at' }, 'at:put:': { k,v -> 'custom-put' })). [$o clone, $o at: 'x', $o at: 'x' put: 1].",
    ),
    ["custom", "custom-at", "custom-put"],
  );
});

Deno.test("root Symbol is separate from Object and has no prototype", () => {
  const environment = macroRootEnvironment();
  const location = { file: "methods.toss", line: 1, column: 1 };
  const symbols = environment.fetch(Symbol.for("Symbol"), location);
  const object = environment.fetch(Symbol.for("Object"), location);
  assert.notEqual(symbols, object);
  assert.equal(
    symbols !== null && typeof symbols === "object" && "prototype" in symbols
      ? symbols.prototype
      : undefined,
    null,
  );
});

Deno.test("unique Symbols are distinct and their native callable is retrievable", () => {
  assert.equal(
    evaluate(
      "#factory bind: ($Symbol at: 'generateUnique'). #a bind: $factory value. #b bind: $factory value. ($a equals: $b).",
    ),
    false,
  );
});
