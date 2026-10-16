import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, text } from "./helpers.ts";

const cases = [
  {
    name: "two arguments",
    source:
      "#show bind: { first, second -> $first print. $second print }. $show value: 'Hello' value: 'Toss'.",
    output: "Hello\nToss\n",
  },
  {
    name: "three arguments",
    source:
      "({ a, b, c -> $a print. $b print. $c } value: 'A' value: 'B' value: 'C') print.",
    output: "A\nB\nC\n",
  },
  {
    name: "four arguments",
    source:
      "({ a, b, c, d -> $a print. $b print. $c print. $d } value: 'A' value: 'B' value: 'C' value: 'D') print.",
    output: "A\nB\nC\nD\n",
  },
  {
    name: "left-to-right argument evaluation",
    source:
      "{ a, b -> $a print. $b print } value: 'first' print value: 'second' print.",
    output: "first\nsecond\nfirst\nsecond\n",
  },
  {
    name: "final pipeline argument",
    source:
      "#show bind: { a, b -> $a print. $b print }. 'last' print |> $show value: 'first' print value:.",
    output: "last\nfirst\nfirst\nlast\n",
  },
  {
    name: "argument captures are distinct",
    source:
      "#make bind: { a, b -> { $a print. $b } }. #read bind: ($make value: 'A' value: 'B'). $read value print.",
    output: "A\nB\n",
  },
  {
    name: "local parameter rebinding",
    source:
      "#a bind: 'outer'. ({ a, b -> #a bind: $b. $a } value: 'first' value: 'second') print. $a print.",
    output: "second\nouter\n",
  },
  {
    name: "case-sensitive parameters",
    source: "{ x, X -> $x print. $X print } value: 'lower' value: 'upper'.",
    output: "lower\nupper\n",
  },
  {
    name: "comments between parameters",
    source:
      "{ a, // separator\n b -> $a print. $b print } value: 'A' value: 'B'.",
    output: "A\nB\n",
  },
  {
    name: "runtime names stay separate",
    source:
      "{ arg0, scope, captured -> $arg0 print. $scope print. $captured print } value: 'A' value: 'B' value: 'C'.",
    output: "A\nB\nC\n",
  },
] as const;

for (const fixture of cases) {
  Deno.test(`multi-argument block supports ${fixture.name}`, async () => {
    const result = await execute(fixture.source);

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), fixture.output);
    assert.equal(text(result.stderr), "");
  });
}

for (
  const source of [
    "{ x, x -> $x }.",
    "{ x, -> $x }.",
    "{ x,, y -> $x }.",
    "{ , x -> $x }.",
    "{ x y -> $x }.",
    "{ x, $y -> $x }.",
    "{ x, y -> }.",
    "'a', 'b'.",
  ]
) {
  Deno.test(`rejects malformed parameter list ${JSON.stringify(source)}`, () => {
    assert.throws(() => compile(source, "invalid.toss"), TossSyntaxError);
  });
}

for (
  const [source, diagnostic] of [
    [
      "{ a, b -> 'never' print } value.",
      "Block expects 2 argument(s), received 0.",
    ],
    [
      "{ a, b -> 'never' print } value: 'one'.",
      "Block expects 2 argument(s), received 1.",
    ],
    [
      "{ a -> 'never' print } value: 'one' value: 'two'.",
      "Block expects 1 argument(s), received 2.",
    ],
    [
      "{ a, b -> 'never' print } value: 'one' value: 'two' value: 'three'.",
      "Block expects 2 argument(s), received 3.",
    ],
    [
      "{ a, b -> 'never' print } value: 'one' with: 'two'.",
      'Unknown message "value:with:" for Block.',
    ],
    [
      "'receiver' value: 'one' value: 'two'.",
      'Unknown message "value:value:" for String.',
    ],
  ] as const
) {
  Deno.test(`rejects invalid block call ${source}`, async () => {
    const result = await execute(source);

    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "");
    assert.ok(text(result.stderr).includes(diagnostic), text(result.stderr));
  });
}

Deno.test("reports the duplicate parameter's original position", () => {
  assert.throws(
    () => compile("{ x, x -> $x }.", "duplicate.toss"),
    (error: unknown) => {
      assert.ok(error instanceof TossSyntaxError);
      assert.deepEqual(error.location, {
        file: "duplicate.toss",
        line: 1,
        column: 6,
      });
      assert.ok(error.message.includes('Duplicate block parameter "x"'));
      return true;
    },
  );
});

Deno.test("reports arity errors at the multi-argument call", async () => {
  const result = await execute(
    "#run bind: { x -> $x }.\n$run value: 'A' value: 'B'.",
  );

  assert.notEqual(result.code, 0);
  assert.ok(
    text(result.stderr).includes(
      "fixture.toss:2:6: RuntimeError: Block expects 1 argument(s), received 2.",
    ),
  );
});
