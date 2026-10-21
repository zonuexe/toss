import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, text } from "./helpers.ts";

const cases = [
  [
    "computed string and symbol keys retain distinct identity",
    "#key bind: 'name'. #tag bind: #tag. #o bind: ($Object clone |> %extend(($key): 1, (#tag): 2)). [$o at: 'name', $o at: #tag] dump.",
    "[1, 2]\n",
  ],
  [
    "static and computed keys overwrite in source order",
    "#key bind: 'name'. #o bind: ($Object clone |> %extend(name: 1, ($key): 2, 'name': 3)). $o name print.",
    "3\n",
  ],
  [
    "keys and values evaluate once in order with earlier writes visible",
    "#o bind: $Object clone. #key bind: { 'key' print. 'first' }. #value bind: { 'value' print. $o first }. $o |> %extend(($key value): ('written' print), ({ 'second' print. 'second' } value): $value value). ($o at: 'first') print.",
    "key\nwritten\nsecond\nvalue\nwritten\n",
  ],
  [
    "computed key expressions use caller bindings and lexical self",
    "#host bind: $Object clone. $host at: 'name' put: 'host'. $host at: 'make:' put: { target -> $target |> %extend(($self name): $self name) }. #o bind: $Object clone. $o at: 'name' put: 'target'. #r bind: ($host make: $o). $r host print.",
    "host\n",
  ],
  [
    "custom setter receives non-string computed keys",
    "#o bind: $Object clone. #sink bind: $Object clone. $o at: 'at:put:' put: { key, value -> $sink at: 'key' put: $key. $sink at: 'value' put: $value. 'ignored' }. $o |> %extend((1 add: 2): 7). [$sink key, $sink value] dump.",
    "[3, 7]\n",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`dynamic extension keys: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

Deno.test("default setter rejects computed invalid key after evaluating value", async () => {
  const result = await execute(
    "#o bind: $Object clone. $o |> %extend((1): 'value' print).",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "value\n");
  assert.match(text(result.stderr), /Object key must be a string or symbol/);
});

Deno.test("a failing dynamic key prevents its value and later entries", async () => {
  const result = await execute(
    "#o bind: $Object clone. $o |> %extend(($missing): 'value' print, later: 'later' print).",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(text(result.stderr), /Unbound name "missing"/);
});

Deno.test("dynamic setter errors point at the opening parenthesis", async () => {
  const result = await execute(
    "#o bind: $Object clone. $o at: 'at:put:' put: 7.\n$o |> %extend(\n  ('key'): 1\n).",
  );
  assert.notEqual(result.code, 0);
  assert.match(text(result.stderr), /fixture\.toss:3:3: RuntimeError:/);
});

for (
  const source of [
    "$Object clone |> %extend((): 1).",
    "$Object clone |> %extend((name): 1).",
    "$Object clone |> %extend(($key 1): 1).",
    "$Object clone |> %extend(($key): 1,).",
    "$Object clone |> %extend(($key) 1).",
    "$Object clone |> %extend(($key) :).",
    "$Object clone |> %extend(($key): 1,, name: 2).",
    "$Object clone |> %extend(#tag: 1).",
    "$Object clone |> %extend($key: 1).",
  ]
) {
  Deno.test(`dynamic extension key rejects malformed syntax ${source}`, () => {
    assert.throws(() => compile(source, "invalid.toss"), TossSyntaxError);
  });
}
