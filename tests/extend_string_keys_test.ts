import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, text } from "./helpers.ts";

Deno.test("quoted extension labels support message selector keys", async () => {
  const result = await execute(
    "#counter bind: ($Object clone |> #extend(base: 10, 'add:': { n -> $self base add: $n })). ($counter add: 3) print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "13\n");
  assert.equal(text(result.stderr), "");
});

Deno.test("multi-part selector keys preserve block arity and inherited self", async () => {
  const result = await execute(
    "#parent bind: ($Object clone |> #extend(label: 'parent', 'add:with:': { left, right -> [$self label, $left add: $right] })). #child bind: $parent clone. ($child add: 2 with: 3) dump.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), '["parent", 5]\n');
});

Deno.test("quoted labels allow arbitrary strings and existing escapes", async () => {
  const result = await execute(
    "#o bind: ($Object clone |> #extend('': 1, '空 白!::': 2, 'quote\\'\\\\': 3)). [$o at: '', $o at: '空 白!::', $o at: 'quote\\'\\\\'] dump.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "[1, 2, 3]\n");
});

Deno.test("quoted and bare labels share string key overwrite order", async () => {
  const result = await execute(
    "#o bind: ($Object clone |> #extend(key: 1, 'key': 2, key: 3)). $o key print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "3\n");
});

Deno.test("quoted entries support nesting, blocks, and whitespace before colon", async () => {
  const result = await execute(
    "#o bind: ($Object clone |> #extend('child' // label\n : ($Object clone |> #extend('value' : 8)), reader: { $self child value })). ($o reader) print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "8\n");
});

Deno.test("quoted entry setter errors point at the opening quote", async () => {
  const result = await execute(
    "#o bind: $Object clone.\n$o at: 'at:put:' put: 7.\n$o |> #extend(\n  'selector:': 1\n).",
  );
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /fixture\.toss:4:3: RuntimeError: Object slot "at:put:" is not callable\./,
  );
});

for (
  const source of [
    "$Object clone |> #extend('key' 1).",
    "$Object clone |> #extend('key':).",
    "$Object clone |> #extend('key': 1,).",
    "$Object clone |> #extend(#key: 1).",
    "$Object clone |> #extend('key': 1,, other: 2).",
    "'quoted': 1.",
  ]
) {
  Deno.test(`quoted extension label rejects malformed syntax ${source}`, () => {
    assert.throws(() => compile(source, "invalid.toss"), TossSyntaxError);
  });
}

Deno.test("ordinary strings and comments keep their existing meaning", async () => {
  const result = await execute(
    "#text bind: 'normal \\n string'. // 'key': is only comment text\n$text print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "normal \\n string\n");
});
