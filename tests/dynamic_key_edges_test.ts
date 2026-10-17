import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  [
    "a pipeline key binds in the caller's environment",
    "#o bind: $Object clone. $o |> #extend(('answer' |> #saved bind:): $saved). $saved print. $o answer print.",
    "answer\nanswer\n",
  ],
  [
    "key and value expressions keep the caller's lexical self",
    "#host bind: ($Object clone |> #extend(name: 'host', 'make:': { target -> $target |> #extend(($self name): $self name) })). #o bind: ($Object clone |> #extend(name: 'target')). $host make: $o. ($o at: 'host') print. $o name print.",
    "host\ntarget\n",
  ],
  [
    "all string label forms share a slot while symbol keys stay distinct",
    "#o bind: ($Object clone |> #extend(name: 1, ('name'): 2, 'name': 3, (#name): 4)). [$o name, $o at: #name] dump.",
    "[3, 4]\n",
  ],
  [
    "symbol-keyed Blocks are stored without invocation",
    "#o bind: ($Object clone |> #extend((#action): { 'called' print. 7 })). 'installed' print. (($o at: #action) value) print.",
    "installed\ncalled\n7\n",
  ],
  [
    "computed selectors install ordinary inherited Methods",
    "#selector bind: 'add:'. #p bind: ($Object clone |> #extend(base: 10, ($selector): { n -> $self base add: $n })). #c bind: ($p clone |> #extend(base: 20)). ($c add: 3) print. ($p add: 3) print.",
    "23\n13\n",
  ],
  [
    "keys observe previous writes and evaluate once before each value",
    "#o bind: $Object clone. #key bind: { 'key' print. $o next }. #value bind: { 'value' print. 9 }. $o |> #extend(next: 'field', ($key value): $value value). $o field print.",
    "key\nvalue\n9\n",
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

for (const key of ["1", "$True", "$Nil", "[]", "{ 'body' print }"]) {
  Deno.test(`default setter rejects ${key} after value evaluation`, async () => {
    const result = await execute(
      `'before' print.\n$Object clone |> #extend(\n  (${key}): 'value' print,\n  later: 'later' print\n).`,
    );
    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "before\nvalue\n");
    assert.match(
      text(result.stderr),
      /fixture\.toss:3:3: RuntimeError: Object key must be a string or symbol\./,
    );
  });
}

Deno.test("invalid extension targets stop before key and value evaluation", async () => {
  const result = await execute("[] |> #extend(('key' print): 'value' print).");
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(text(result.stderr), /#extend target must be an Object/);
});

Deno.test("a failing computed key keeps its fetch location and skips its value", async () => {
  const result = await execute(
    "'before' print.\r\n$Object clone |> #extend(\r\n  ($missing): 'value' print,\r\n  later: 'later' print\r\n).",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "before\n");
  assert.match(
    text(result.stderr),
    /fixture\.toss:3:4: RuntimeError: Unbound name "missing"\./,
  );
});
