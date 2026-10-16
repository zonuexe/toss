import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const successes = [
  [
    "unary data slot",
    "#o bind: $Object clone. $o at: 'name' put: 'Ada'. $o name print.",
    "Ada\n",
  ],
  [
    "keyword method",
    "#o bind: $Object clone. $o at: 'greet:' put: { name -> 'Hello' print. $name }. ($o greet: 'Toss') print.",
    "Hello\nToss\n",
  ],
  [
    "two argument method preserves order",
    "#o bind: $Object clone. $o at: 'combine:with:' put: { first, second -> $first print. $second }. ($o combine: 'left' with: 'right') print.",
    "left\nright\n",
  ],
  [
    "inherited method sees child",
    "#p bind: $Object clone. $p at: 'name' put: 'parent'. $p at: 'show' put: { $self name }. #c bind: $p clone. $c at: 'name' put: 'child'. $c show print.",
    "child\n",
  ],
  [
    "slot overrides prelude",
    "#o bind: $Object clone. $o at: 'clone' put: 'custom'. $o clone print.",
    "custom\n",
  ],
  [
    "symbol slot does not answer string selector",
    "#o bind: $Object clone. $o at: #m put: 'symbol'. $o at: 'm' put: 'string'. $o m print.",
    "string\n",
  ],
  [
    "returned nested block keeps self",
    "#o bind: $Object clone. $o at: 'name' put: 'saved'. $o at: 'make' put: { { $self name } }. #later bind: $o make. $later value print.",
    "saved\n",
  ],
  [
    "nested readers from separate invocations keep their own self",
    "#o bind: $Object clone. $o at: 'name' put: 'one'. #p bind: $Object clone. $p at: 'name' put: 'two'. #factory bind: { { $self name } }. $o at: 'reader' put: $factory. $p at: 'reader' put: $factory. #first bind: $o reader. #second bind: $p reader. $second value print. $first value print.",
    "two\none\n",
  ],
  [
    "method resolves lexical outer binding",
    "#make bind: { #label bind: 'lexical'. #scope bind: $Object clone. $scope at: 'read' put: { $label }. $scope }. #scope bind: $make value. #label bind: 'caller'. $scope read print.",
    "lexical\n",
  ],
  [
    "direct block call preserves captured self",
    "#o bind: $Object clone. $o at: 'name' put: 'lexical'. $o at: 'make' put: { #f bind: { $self name }. $f }. #f bind: $o make. #other bind: $Object clone. $other at: 'name' put: 'other'. $other at: 'f' put: $f. (($other at: 'f') value) print.",
    "lexical\n",
  ],
  [
    "method block binds its new receiver",
    "#o bind: $Object clone. $o at: 'name' put: 'A'. $o at: 'm' put: { $self name }. #method bind: ($o at: 'm'). #b bind: $o clone. $b at: 'name' put: 'B'. $b at: 'm' put: $method. $b m print.",
    "B\n",
  ],
  [
    "at returns method as block data",
    "#o bind: $Object clone. $o at: 'm' put: { 'data' }. #m bind: ($o at: 'm'). $m value print.",
    "data\n",
  ],
  [
    "object print and dump convert virtually",
    "#o bind: $Object clone. $o at: 'toString' put: { 'custom' }. $o at: 'inspect' put: { 'debug' }. $o print. $o dump.",
    "custom\ndebug\n",
  ],
] as const;

for (const [name, source, output] of successes) {
  Deno.test(`methods: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

const failures = [
  [
    "unary method arity",
    "#o bind: $Object clone. $o at: 'm' put: { x -> $x }. $o m.",
    "Block expects 1 argument(s), received 0.",
  ],
  [
    "keyword method arity",
    "#o bind: $Object clone.\n$o at: 'm:m:' put: { x -> $x }.\n$o m: 'a' m: 'b'.",
    "Block expects 1 argument(s), received 2.",
  ],
  [
    "non-callable keyword slot",
    "#o bind: $Object clone. $o at: 'm:' put: 'data'. $o m: 'arg'.",
    'Object slot "m:" is not callable.',
  ],
  [
    "non-string conversion",
    "#o bind: $Object clone. $o at: 'toString' put: { $Object }. $o print.",
    "toString must return a string.",
  ],
] as const;

for (const [name, source, reason] of failures) {
  Deno.test(`methods: ${name} errors at the message`, async () => {
    const result = await execute(source);
    assert.notEqual(result.code, 0);
    assert.ok(
      text(result.stderr).includes(
        `fixture.toss:${name === "keyword method arity" ? "3:4" : "1:"}`,
      ),
      text(result.stderr),
    );
    assert.ok(
      text(result.stderr).includes(`RuntimeError: ${reason}`),
      text(result.stderr),
    );
  });
}

Deno.test("method self is shadowed by its parameter", async () => {
  const result = await execute(
    "#o bind: $Object clone. $o at: 'm:' put: { self -> $self }. ($o m: 'parameter') print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "parameter\n");
});

Deno.test("method self is shadowed by local binding", async () => {
  const result = await execute(
    "#o bind: $Object clone. $o at: 'n' put: { #self bind: 'local'. $self }. $o n print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "local\n");
});

Deno.test("method print returns original receiver", async () => {
  const result = await execute(
    "#o bind: $Object clone. $o at: 'toString' put: { 'shown' }. $o at: 'after' put: 'original'. ($o print) after print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "shown\noriginal\n");
});
