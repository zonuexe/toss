import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const successes = [
  [
    "nested parent arguments retain the outer invocation owner",
    "#a bind: ($Object clone |> %extend(m: { x -> $x add: 1 })). #b bind: ($a clone |> %extend(m: { %super(%super(1)) })). $b m print.",
    "3\n",
  ],
  [
    "shared Block gets the selected owner and exact key each time",
    "#f bind: { n -> %super($n) }. #a bind: ($Object clone |> %extend('left:': { n -> 'a' print. $n })). #b bind: ($Object clone |> %extend('right:': { n -> 'b' print. $n })). #x bind: ($a clone |> %extend('left:': $f)). #y bind: ($b clone |> %extend('right:': $f)). ($x left: 1) print. ($y right: 2) print.",
    "a\n1\nb\n2\n",
  ],
  [
    "ordinary callback uses its captured method context",
    "#a bind: ($Object clone |> %extend(m: { 'a' })). #b bind: ($a clone |> %extend(m: { { %super() } })). #saved bind: $b m. #c bind: ($Object clone |> %extend(m: { 'c' })). #d bind: ($c clone |> %extend(m: { $saved value })). $d m print.",
    "a\n",
  ],
  [
    "reinstalled closure gets fresh context without changing captured context",
    "#a bind: ($Object clone |> %extend(m: { 'a' })). #b bind: ($a clone |> %extend(m: { { %super() } })). #saved bind: $b m. #c bind: ($Object clone |> %extend(other: { 'c' })). #d bind: ($c clone |> %extend(other: $saved)). $d other print. $saved value print.",
    "c\na\n",
  ],
  [
    "local self binding cannot redirect parent receiver",
    "#a bind: ($Object clone |> %extend(m: { $self name })). #b bind: ($a clone |> %extend(name: 'child', m: { #self bind: 'shadow'. %super() })). $b m print.",
    "child\n",
  ],
  [
    "escaped closure observes parent slot replacement",
    "#a bind: ($Object clone |> %extend(m: { 'old' })). #b bind: ($a clone |> %extend(m: { { %super() } })). #saved bind: $b m. $a at: 'm' put: { 'new' }. $saved value print.",
    "new\n",
  ],
  [
    "argument binding uses the caller scope without a synthetic Block",
    "#a bind: ($Object clone |> %extend(m: { x -> $x })). #b bind: ($a clone |> %extend(m: { %super('value' |> #saved bind:). $saved })). $b m print.",
    "value\n",
  ],
  [
    "arguments evaluate once from left to right",
    "#a bind: ($Object clone |> %extend(m: { a,b -> [$a,$b] })). #b bind: ($a clone |> %extend(m: { %super('first' print, 'second' print) })). $b m dump.",
    'first\nsecond\n["first", "second"]\n',
  ],
  [
    "clone prelude fallback acts on the original receiver",
    "#o bind: ($Object clone |> %extend(name: 'original', clone: { %super() })). #c bind: $o clone. $c at: 'name' put: 'copy'. $c name print. $o name print.",
    "copy\noriginal\n",
  ],
  [
    "keyword prelude fallback receives explicit arguments",
    "#o bind: ($Object clone |> %extend('at:put:': { key,value -> %super($key,$value) })). ($o at: 'answer' put: 42) print. ($o at: 'answer') print.",
    "42\n42\n",
  ],
  [
    "unique selector and original receiver survive inherited parent call",
    "#key bind: $Symbol generateUnique. #a bind: ($Object clone |> %extend(($key): { n -> [$self name,$n] })). #b bind: ($a clone |> %extend(($key): { n -> %super($n add: 1) })). #c bind: ($b clone |> %extend(name: 'child')). ($c perform: $key withArguments: [3]) dump.",
    '["child", 4]\n',
  ],
] as const;

for (const [name, source, output] of successes) {
  Deno.test(`parent call edge: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

const failures = [
  [
    "Symbol selector does not reach same-named String prelude",
    "#o bind: ($Object clone |> %extend((#clone): { %super() })). $o perform: #clone.",
    "Unknown parent message #clone.",
  ],
  [
    "ordinary callback cannot borrow invoking method context",
    "#f bind: { %super() }. #a bind: ($Object clone |> %extend(m: { 'wrong' print })). #b bind: ($a clone |> %extend(m: { $f value })). $b m.",
    "%super requires a method invocation context.",
  ],
  [
    "zero explicit arguments do not forward current arguments",
    "#a bind: ($Object clone |> %extend('m:': { x -> 'wrong' print })). #b bind: ($a clone |> %extend('m:': { x -> %super() })). $b m: 1.",
    "Block expects 1 argument(s), received 0.",
  ],
  [
    "noncallable ancestor is not skipped",
    "#a bind: ($Object clone |> %extend(m: { 'wrong' print })). #b bind: ($a clone |> %extend(m: 2)). #c bind: ($b clone |> %extend(m: { %super(1) })). $c m.",
    'Object slot "m" is not callable.',
  ],
] as const;

for (const [name, source, reason] of failures) {
  Deno.test(`parent call edge: ${name}`, async () => {
    const result = await execute(source);
    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "");
    assert.ok(text(result.stderr).includes(reason), text(result.stderr));
  });
}

Deno.test("parent missing-context error follows all argument effects", async () => {
  const result = await execute(
    "'before' print.\n  %super('first' print, 'second' print).\n'after' print.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "before\nfirst\nsecond\n");
  assert.match(text(result.stderr), /fixture\.toss:2:3: RuntimeError:/);
});

Deno.test("parent argument errors retain their position and stop later arguments", async () => {
  const result = await execute(
    "%super(\n  $missing,\n  'later' print\n).",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(
    text(result.stderr),
    /fixture\.toss:2:3: RuntimeError: Unbound name/,
  );
});
