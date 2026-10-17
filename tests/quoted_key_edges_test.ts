import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  [
    "bare and quoted labels share keys but selector colons remain significant",
    "#o bind: ($Object clone |> #extend(name: 1, 'name': 2, 'name:': { x -> $x })). $o name print. ($o name: 7) print.",
    "2\n7\n",
  ],
  [
    "inherited quoted methods use the child's actual self",
    "#p bind: ($Object clone |> #extend(base: 10, 'add:': { n -> $self base add: $n })). #c bind: ($p clone |> #extend(base: 20)). ($c add: 3) print. ($p add: 3) print.",
    "23\n13\n",
  ],
  [
    "a quoted setter override takes effect before the next entry",
    "#sink bind: $Object clone. #o bind: ($Object clone |> #extend('at:put:': { key,value -> $key print. $sink at: $key put: $value. 'ignored' }, 'first': 'value' print, second: 9)). [$sink first, $sink second] dump. ($o at: 'at:put:') value: 'third' value: 3. $sink third print.",
    'value\nfirst\nsecond\n["value", 9]\nthird\n3\n',
  ],
  [
    "quoted string keys remain distinct from named-symbol keys",
    "#o bind: $Object clone. $o at: #tag put: 7. $o |> #extend('tag': 8). [$o at: #tag, $o at: 'tag'] dump.",
    "[7, 8]\n",
  ],
  [
    "quoted key contents are stored as data",
    String
      .raw`#o bind: ($Object clone |> #extend('"); throw Error("oops") //': 5)). ($o at: '"); throw Error("oops") //') print.`,
    "5\n",
  ],
  [
    "literal backslash-n and an embedded newline are different keys",
    String.raw`#o bind: ($Object clone |> #extend('\n': 1, '
': 2)). [$o at: '\n', $o at: '
'] dump.`,
    "[1, 2]\n",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`quoted extension keys: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

Deno.test("quoted label diagnostics retain opening quote across a line comment", async () => {
  const result = await execute(
    "#o bind: $Object clone.\n$o at: 'at:put:' put: 7.\n$o |> #extend(\n  'first' // comment\n  : 'value' print,\n  'later': 'later' print\n).",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "value\n");
  assert.match(
    text(result.stderr),
    /fixture\.toss:4:3: RuntimeError: Object slot "at:put:" is not callable\./,
  );
});

Deno.test("quoted methods check arity at invocation rather than installation", async () => {
  const result = await execute(
    "#o bind: ($Object clone |> #extend('run:': { a,b -> $a })).\n'before' print.\n($o run: 1) print.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "before\n");
  assert.match(
    text(result.stderr),
    /fixture\.toss:3:5: RuntimeError: Block expects 2 argument\(s\), received 1\./,
  );
});
