import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

Deno.test("repetition closures keep separate invocation environments", async () => {
  const source = `#state bind: $Object clone.
$state at: 'n' put: 0.
3 times: {
  #n bind: (($state at: 'n') add: 1).
  $state at: 'n' put: $n.
  $state at: ($n toString) put: { $n }.
}.
(($state at: '1') value) print.
(($state at: '2') value) print.
(($state at: '3') value) print.`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "1\n2\n3\n");
});

Deno.test("repetition in inherited methods retains lexical self", async () => {
  const source = `#parent bind: $Object clone.
$parent at: 'n' put: 0.
$parent at: 'run' put: {
  2 times: { $self at: 'n' put: (($self at: 'n') add: 1) }
}.
#child bind: $parent clone.
($child run) print.
($child at: 'n') print.
($parent at: 'n') print.`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "2\n2\n0\n");
});

Deno.test("repetition stops after a later invocation fails", async () => {
  const source = `#state bind: $Object clone.
$state at: 'n' put: 0.
3 times: {
  #n bind: (($state at: 'n') add: 1).
  $state at: 'n' put: $n.
  $n print.
  ($n equals: 2) ifTrue: {
    $missing
  }.
}.`;

  const result = await execute(source);

  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "1\n2\n");
  assert.ok(
    text(result.stderr).includes(
      'fixture.toss:8:5: RuntimeError: Unbound name "missing".',
    ),
    text(result.stderr),
  );
});

for (
  const [source, output] of [
    ["(2 times: { $False }) not print.", "true\n"],
    ["(1 times: { { 42 } }) value print.", "42\n"],
    [
      "#o bind: $Object clone. $o at: 'n' put: 12. (1 times: { $o }) n print.",
      "12\n",
    ],
  ] as const
) {
  Deno.test(`repetition preserves returned value: ${source}`, async () => {
    const result = await execute(source);

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}
