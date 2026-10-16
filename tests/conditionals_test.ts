import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  { source: "($True ifTrue: { 'yes' }) print.", output: "yes\n" },
  { source: "($False ifTrue: { 'no' }) print.", output: "nil\n" },
  { source: "($True ifFalse: { 'no' }) print.", output: "nil\n" },
  { source: "($False ifFalse: { 'yes' }) print.", output: "yes\n" },
  { source: "($False ifTrue: { x -> $x }) print.", output: "nil\n" },
  { source: "($True ifFalse: { x -> $x }) print.", output: "nil\n" },
  { source: "($True ifTrue: { 42 } ifFalse: { 'no' }) print.", output: "42\n" },
  {
    source: "($False ifTrue: { 'no' } ifFalse: { 24 }) print.",
    output: "24\n",
  },
  {
    source: "#Nil bind: 'shadow'. ($False ifTrue: { 'skip' }) dump.",
    output: "nil\n",
  },
  {
    source:
      "($True ifTrue: { $False ifTrue: { 'no' } ifFalse: { 'nested' } } ifFalse: { 'no' }) print.",
    output: "nested\n",
  },
  { source: "($True ifTrue: { } ) dump.", output: "nil\n" },
  {
    source:
      "#True bind: 'shadow true'. #False bind: 'shadow false'. ((2 lessThan: 3) ifTrue: { 'less' } ifFalse: { 'not less' }) print. ((4 lessThan: 3) ifTrue: { 'not greater' } ifFalse: { 'greater' }) print.",
    output: "less\ngreater\n",
  },
] as const;

for (const fixture of cases) {
  Deno.test(`conditional executes ${fixture.source}`, async () => {
    const result = await execute(fixture.source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), fixture.output);
    assert.equal(text(result.stderr), "");
  });
}

const failures = [
  {
    source: "$True ifTrue: { 'never' print } ifFalse: 'bad'.",
    reason: "Block argument required.",
    output: "",
  },
  {
    source: "$True ifTrue: { 'never' print } ifFalse: 12.",
    reason: "Block argument required.",
    output: "",
  },
  {
    source: "$False ifTrue: 12 ifFalse: { 'never' print }.",
    reason: "Block argument required.",
    output: "",
  },
  {
    source: "$False ifTrue: { 'never' print } ifFalse: 12.",
    reason: "Block argument required.",
    output: "",
  },
  {
    source: "$False ifTrue: 12.",
    reason: "Block argument required.",
    output: "",
  },
  {
    source: "$True ifFalse: 12.",
    reason: "Block argument required.",
    output: "",
  },
  {
    source: "$True ifTrue: { x -> $x }.",
    reason: "Block expects 1 argument(s), received 0.",
    output: "",
  },
  {
    source: "1 ifTrue: { }.",
    reason: 'Unknown message "ifTrue:" for Number.',
    output: "",
  },
  {
    source: "$Nil ifTrue: { }.",
    reason: 'Unknown message "ifTrue:" for Nil.',
    output: "",
  },
] as const;

for (const fixture of failures) {
  Deno.test(`conditional reports failure for ${fixture.source}`, async () => {
    const result = await execute(fixture.source);
    assert.notEqual(result.code, 0);
    assert.ok(
      text(result.stderr).includes(fixture.reason),
      text(result.stderr),
    );
    assert.equal(text(result.stdout), fixture.output);
  });
}

const successes = [
  "$True ifTrue: { 'selected' } ifFalse: { x -> }.",
  "$False ifTrue: { x -> } ifFalse: { 'selected' }.",
] as const;

for (const source of successes) {
  Deno.test(`conditional ignores unused block arity ${source}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "");
    assert.equal(text(result.stderr), "");
  });
}

Deno.test("conditionals defer branch bodies after eager argument construction", async () => {
  const result = await execute(
    "#receiver bind: { 'receiver' print. $True }. #make bind: { tag, block -> $tag print. $block }. ($receiver value) ifTrue: ($make value: 'true argument' value: { 'selected body' print }) ifFalse: ($make value: 'false argument' value: { 'unused body' print }).",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(
    text(result.stdout),
    "receiver\ntrue argument\nfalse argument\nselected body\n",
  );
});

Deno.test("unselected branch errors do not run", async () => {
  const result = await execute(
    "($True ifTrue: { 'chosen' } ifFalse: { $missing }) print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "chosen\n");
});

Deno.test("selected branch errors keep their body location", async () => {
  const result = await execute("$True ifTrue: {\n  $missing\n} ifFalse: { }.");
  assert.notEqual(result.code, 0);
  assert.ok(
    text(result.stderr).includes(
      'fixture.toss:2:3: RuntimeError: Unbound name "missing".',
    ),
    text(result.stderr),
  );
});

Deno.test("conditionals use lexical self in invoked method blocks", async () => {
  const result = await execute(
    "#root bind: $Object clone. $root at: 'run' put: { ($True ifTrue: { $self at: 'name' } ifFalse: { 'wrong' }) }. #child bind: $root clone. $child at: 'name' put: 'child'. ($child run) print. ($True ifTrue: { $False ifTrue: { 'wrong' } ifFalse: { 'nested after method' } } ifFalse: { 'wrong' }) print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "child\nnested after method\n");
  assert.equal(text(result.stderr), "");
});

Deno.test("conditional type errors use the send location", async () => {
  const result = await execute("$True ifTrue: { }.\n$True ifTrue: 'bad'.");
  assert.notEqual(result.code, 0);
  assert.ok(
    text(result.stderr).includes(
      "fixture.toss:2:7: RuntimeError: Block argument required.",
    ),
    text(result.stderr),
  );
});

Deno.test("selected body arity errors use the conditional send location", async () => {
  const result = await execute(
    "'before' print.\n$False ifTrue: { } ifFalse: { x -> }.",
  );
  assert.notEqual(result.code, 0);
  assert.ok(
    text(result.stderr).includes(
      "fixture.toss:2:8: RuntimeError: Block expects 1 argument(s), received 0.",
    ),
    text(result.stderr),
  );
  assert.equal(text(result.stdout), "before\n");
});
