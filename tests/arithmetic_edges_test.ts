import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, executeJavaScript, text } from "./helpers.ts";

const cases = [
  [
    "unary minus sends negated to fetched objects",
    "#o bind: $Object clone. $o at: 'negated' put: { 'negated' print. 7 }. $(-$o) print.",
    "negated\n7\n",
  ],
  [
    "all five arithmetic selectors use inherited methods and actual self",
    "#p bind: $Object clone. $p at: 'subtract:' put: { x -> $self n subtract: $x }. $p at: 'divideBy:' put: { x -> $self n divideBy: $x }. $p at: 'remainder:' put: { x -> $self n remainder: $x }. #c bind: $p clone. $c at: 'n' put: 10. [$($c-2), $($c/2), $($c%3)] dump.",
    "[8, 5, 1]\n",
  ],
  [
    "sibling operations run once left to right",
    "#o bind: $Object clone. $o at: 'add:' put: { x -> $x print. $x }. $(($o+1)*($o+2)) print.",
    "1\n2\n2\n",
  ],
  [
    "nested groups and macro comments preserve subsequent Toss syntax",
    "[$((1+$(2*3))), $(-(-2)), $(6 // $( ) +\n / 2)] dump. -2 print. ({ x -> $x } value: 5) print.",
    "[7, 2, 3]\n-2\n5\n",
  ],
  [
    "unary result messages and keyword arguments compose",
    "#a bind: [0]. $a at: 0 put: $(2+3). $a dump. $(4*2) negated print.",
    "[5]\n-8\n",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`arithmetic macro: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

for (
  const source of [
    "$().",
    "$(1 2).",
    "$(1,2).",
    "$(1+2.",
    "$((1+2).",
    "$(1+2)).",
    "$(1++2).",
    "$(1// no close\n.",
    "$('a'+1).",
    "$(1 print+2).",
    "$(1 add: 2).",
    "$(#x+1).",
    "$(1+2). 1+2.",
    "$(1+2). +1.",
    "$(1+2). - 1.",
    "$(1+2). /* comment */",
    "$(1+2). $(1e3).",
  ]
) {
  Deno.test(`arithmetic syntax rejects ${JSON.stringify(source)}`, () => {
    assert.throws(() => compile(source, "invalid.toss"), TossSyntaxError);
  });
}

Deno.test("arithmetic macro keeps negative zero in its runtime result", async () => {
  const result = await executeJavaScript(
    compile("#zero bind: $(-0).", "fixture.toss") +
      '\nconsole.log(Object.is(environment.bindings.get(Symbol.for("zero")), -0));',
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
});

Deno.test("arithmetic fetch errors retain their CRLF source location", async () => {
  const result = await execute("'before' print.\r\n  $(1 + $missing) print.");
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "before\n");
  assert.match(
    text(result.stderr),
    /fixture\.toss:2:9: RuntimeError: Unbound name "missing"\./,
  );
});

Deno.test("arithmetic type errors use the operator and stop later effects", async () => {
  const result = await execute(
    "#bad bind: 'x'.\n$(1 + $bad) print. 'after' print.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(
    text(result.stderr),
    /fixture\.toss:2:5: RuntimeError: Number argument required\./,
  );
});
