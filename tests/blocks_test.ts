import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  {
    name: "creation is lazy",
    source: "#hello bind: { 'never' print }.",
    output: "",
  },
  {
    name: "zero arguments",
    source: "#hello bind: { 'Hello' print }. $hello value.",
    output: "Hello\n",
  },
  {
    name: "one argument",
    source: "#echo bind: { name -> $name print }. $echo value: 'Toss'.",
    output: "Toss\n",
  },
  {
    name: "last expression is returned",
    source: "{ 'first' print. 'last' } value print.",
    output: "first\nlast\n",
  },
  {
    name: "optional final period",
    source: "{ 'Hello'. } value print.",
    output: "Hello\n",
  },
  {
    name: "multiple calls",
    source: "#hello bind: { 'Hello' }. $hello value print. $hello value print.",
    output: "Hello\nHello\n",
  },
  {
    name: "outer rebinding is visible",
    source:
      "#x bind: 'before'. #read bind: { $x }. #x bind: 'after'. $read value print.",
    output: "after\n",
  },
  {
    name: "later outer binding is visible",
    source: "#read bind: { $x }. #x bind: 'later'. $read value print.",
    output: "later\n",
  },
  {
    name: "local binding shadows outer",
    source: "#x bind: 'outer'. { #x bind: 'inner'. $x } value print. $x print.",
    output: "inner\nouter\n",
  },
  {
    name: "argument shadows outer",
    source:
      "#x bind: 'outer'. ({ x -> $x } value: 'argument') print. $x print.",
    output: "argument\nouter\n",
  },
  {
    name: "parameter can be rebound locally",
    source:
      "#x bind: 'outer'. ({ x -> #x bind: 'local'. $x } value: 'argument') print. $x print.",
    output: "local\nouter\n",
  },
  {
    name: "nested closure survives return",
    source:
      "#make bind: { x -> { $x } }. #read bind: ($make value: 'captured'). $read value print.",
    output: "captured\n",
  },
  {
    name: "calls have separate environments",
    source:
      "#make bind: { x -> { $x } }. #a bind: ($make value: 'A'). #b bind: ($make value: 'B'). $a value print. $b value print.",
    output: "A\nB\n",
  },
  {
    name: "lexical rather than caller scope",
    source:
      "#x bind: 'file'. #read bind: { $x }. { #x bind: 'caller'. $read value print } value.",
    output: "file\n",
  },
  {
    name: "nested closure sees local rebinding",
    source:
      "#read bind: { #x bind: 'before'. #inner bind: { $x }. #x bind: 'after'. $inner } value. $read value print.",
    output: "after\n",
  },
  {
    name: "pipeline into a block call",
    source: "#echo bind: { x -> $x }. ('Hello' |> $echo value:) print.",
    output: "Hello\n",
  },
  {
    name: "pipeline ending at closing brace",
    source: "{ 'Hello' |> #x bind: } value print.",
    output: "Hello\n",
  },
  {
    name: "block can be a pipeline value",
    source: "{ 'Hello' } |> #read bind:. $read value print.",
    output: "Hello\n",
  },
  {
    name: "generated names stay separate",
    source:
      "({ scope -> #captured bind: $scope. #arg0 bind: $captured. $arg0 } value: 'safe') print.",
    output: "safe\n",
  },
  {
    name: "comments in parameter list",
    source:
      "({ name // parameter\n -> // body\n $name } value: 'Hello') print.",
    output: "Hello\n",
  },
] as const;

for (const fixture of cases) {
  Deno.test(`block supports ${fixture.name}`, async () => {
    const result = await execute(fixture.source);

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), fixture.output);
    assert.equal(text(result.stderr), "");
  });
}

const failures = [
  {
    source: "{ x -> $x } value.",
    reason: "Block expects 1 argument(s), received 0.",
    output: "",
  },
  {
    source: "{ 'never' print } value: 'extra'.",
    reason: "Block expects 0 argument(s), received 1.",
    output: "",
  },
  {
    source: "{ #local bind: 'private' } value. $local print.",
    reason: 'Unbound name "local".',
    output: "",
  },
  {
    source: "#run bind: { $local print. #local bind: 'private' }. $run value.",
    reason: 'Unbound name "local".',
    output: "",
  },
  {
    source: "{ 'value' } missing.",
    reason: 'Unknown message "missing" for Block.',
    output: "",
  },
] as const;

for (const fixture of failures) {
  Deno.test(`reports block error for ${fixture.source}`, async () => {
    const result = await execute(fixture.source);

    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), fixture.output);
    assert.ok(
      text(result.stderr).includes(fixture.reason),
      text(result.stderr),
    );
  });
}

Deno.test("block errors use the body source location", async () => {
  const source = "#run bind: {\r\n  $missing\r\n}.\r\n$run value.";

  const result = await execute(source);

  assert.notEqual(result.code, 0);
  assert.ok(
    text(result.stderr).includes(
      'fixture.toss:2:3: RuntimeError: Unbound name "missing".',
    ),
  );
  assert.ok(!text(result.stderr).includes("program.js:"));
});

Deno.test("block arity errors use the call source location", async () => {
  const result = await execute("#run bind: { x -> $x }.\r\n$run value.");

  assert.notEqual(result.code, 0);
  assert.ok(
    text(result.stderr).includes(
      "fixture.toss:2:6: RuntimeError: Block expects 1 argument(s), received 0.",
    ),
  );
});
