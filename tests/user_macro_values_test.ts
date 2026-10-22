import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

for (
  const [name, source, expected] of [
    [
      "identity expands one unevaluated expression",
      "%macro(#identity, { s -> $s }). %identity(1 add: 2) print.",
      "3\n",
    ],
    [
      "quasiquote wraps caller syntax",
      "%macro(#show, { s -> %`((%,($s)) print) }). %show(1 add: 2).",
      "3\n",
    ],
    [
      "macro names remain ordinary Named Symbols",
      "%macro(#identity, { s -> $s }). #identity dump. %identity(7) print.",
      "#identity\n7\n",
    ],
    [
      "unused input need not parse as an expression",
      "%macro(#seven, { s -> %quote(7) }). %seven(foo: 1, 2) print.",
      "7\n",
    ],
    [
      "discarded input is not evaluated",
      "%macro(#seven, { s -> %quote(7) }). %seven('never' print) print.",
      "7\n",
    ],
    [
      "empty invocation can produce a value",
      "%macro(#seven, { s -> %quote(7) }). %seven() print.",
      "7\n",
    ],
    [
      "source group reports its kind",
      "%macro(#kind, { s -> ($s kind equals: #group) ifTrue: { %quote(7) } ifFalse: { %quote(9) } }). %kind(1) print.",
      "7\n",
    ],
    [
      "source token reports its kind",
      "%macro(#kind, { s -> (($s children at: 0) kind equals: #token) ifTrue: { %quote(7) } ifFalse: { %quote(9) } }). %kind(1) print.",
      "7\n",
    ],
    [
      "children expose tokens before expression parsing",
      "%macro(#count, { s -> ($s children length equals: 3) ifTrue: { %quote(7) } ifFalse: { %quote(9) } }). %count(1 add: 2) print.",
      "7\n",
    ],
    [
      "token spelling retains numeric source text",
      "%macro(#spell, { s -> #table bind: ($Object clone |> %extend('0007': %quote(42))). $table at: (($s children at: 0) spelling) }). %spell(0007) print.",
      "42\n",
    ],
    [
      "group delimiter is preserved",
      "%macro(#shape, { s -> #table bind: ($Object clone |> %extend('()': %quote(7), '[]': %quote(8), '{}': %quote(9))). $table at: (($s children at: 0) delimiter) }). [%shape((1)), %shape([1]), %shape({1})] dump.",
      "[7, 8, 9]\n",
    ],
    [
      "input fragment has no outer delimiter",
      "%macro(#shape, { s -> #table bind: ($Object clone |> %extend('': %quote(7))). $table at: $s delimiter }). %shape(1) print.",
      "7\n",
    ],
    [
      "children are an independent Array copy",
      "%macro(#copy, { s -> #items bind: $s children. $items at: 0 put: %quote(9). $s }). %copy(1) print.",
      "1\n",
    ],
    [
      "literal quote does not execute its contents",
      "%macro(#literal, { s -> #unused bind: %quote('never' print). %quote(7) }). %literal() print.",
      "7\n",
    ],
    [
      "splicing inserts explicit punctuation",
      "%macro(#array, { s -> #items bind: [%quote(1), %quote(,), %quote(2)]. %`([%,@($items)]) }). %array() dump.",
      "[1, 2]\n",
    ],
    [
      "empty Array splice inserts no syntax",
      "%macro(#array, { s -> %`([%,@([])]) }). %array() dump.",
      "[]\n",
    ],
    [
      "Array map and reduce build syntax",
      "%macro(#array, { s -> #parts bind: ([%quote(2), %quote(3)] map: { p -> %`((%,($p)) add: 1) }). #joined bind: ($parts reduce: %quote(1) with: { acc, p -> %`(%,($acc), %,($p)) }). %`([%,($joined)]) }). %array() dump.",
      "[1, 3, 4]\n",
    ],
    [
      "nested quasiquote does not evaluate a deeper hole",
      "%macro(#nested, { s -> #unused bind: %`(%`(%,($missing))). %quote(7) }). %nested() print.",
      "7\n",
    ],
    [
      "each expansion gets a fresh Object root",
      "%macro(#dirty, { s -> $Object at: 'clone' put: { %quote(9) }. %quote(7) }). %macro(#fresh, { s -> #o bind: $Object clone. $o at: 'result' put: %quote(8). $o result }). %dirty() print. %fresh() print.",
      "7\n8\n",
    ],
    [
      "macro invocations are valid pipeline arguments",
      "%macro(#id, { s -> $s }). (3 |> { a, b -> $a add: $b } value: %id(4) value:) print.",
      "7\n",
    ],
    [
      "generated arithmetic retains caller Fetch scope",
      "%macro(#double, { s -> %`($(%,($s) * 2)) }). ({ n -> %double($n) } value: 4) print.",
      "8\n",
    ],
  ] as const
) {
  Deno.test(`user macro value: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), expected);
  });
}

Deno.test("quasiquote evaluates holes once in left-to-right order", async () => {
  const result = await execute([
    "%macro(#array, { s ->",
    "#state bind: ($Object clone |> %extend(n: 0)).",
    "#first bind: { $state at: 'n' put: ($state n add: 1). %quote(1) }.",
    "#second bind: { ($state n equals: 1) ifTrue: { %quote(2) } ifFalse: { %quote(9) } }.",
    "%`([%,($first value), %,($second value)])",
    "}).",
    "%array() dump.",
  ].join("\n"));
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "[1, 2]\n");
});
