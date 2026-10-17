import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  ["empty input", "([] filter: { x -> $True }) length print.", "0\n"],
  ["all accepted", "([1, 2] filter: { x -> $True }) length print.", "2\n"],
  ["none accepted", "([1, 2] filter: { x -> $False }) length print.", "0\n"],
  [
    "accepted elements preserve order and identity",
    "#source bind: [1, 2, 3, 4, 5]. #r bind: ($source filter: { x -> ($x greaterThan: 1) ifTrue: { ($x lessThan: 5) } ifFalse: { $False } }). ($r at: 0) print. ($r at: 1) print. ($r at: 2) print.",
    "2\n3\n4\n",
  ],
  [
    "fresh result is independent and source remains unchanged",
    "#source bind: [1, 2]. #r bind: ($source filter: { x -> $True }). $r at: 0 put: 9. ($source at: 0) print. ($r at: 0) print.",
    "1\n9\n",
  ],
  [
    "keeps object and nested array references",
    "#o bind: $Object clone. $o at: 'n' put: 1. #a bind: [2]. #r bind: ([$o, $a] filter: { x -> $True }). (($r at: 0) at: 'n') print. ($r at: 0) at: 'n' put: 7. ($o n) print. ($r at: 1) at: 0 put: 8. ($a at: 0) print.",
    "1\n7\n8\n",
  ],
  [
    "only Boolean results accepted",
    "([1, 2] filter: { x -> ($x equals: 1) }) length print.",
    "1\n",
  ],
  [
    "false Boolean drops an element",
    "([1] filter: { x -> $False }) length print.",
    "0\n",
  ],
  [
    "callback effects run once left to right",
    "([1, 2, 3] filter: { x -> $x print. $True }) length print.",
    "1\n2\n3\n3\n",
  ],
  [
    "snapshot protects slots and keeps nested references live",
    "#o bind: $Object clone. $o at: 'n' put: 0. #source bind: [$o, 2, 3]. #r bind: ($source filter: { x -> $source at: 2 put: 99. $o at: 'n' put: ($o n add: 1). $True }). (($r at: 0) n) print. ($r at: 1) print. ($r at: 2) print. ($source at: 2) print. $o n print.",
    "3\n2\n3\n99\n3\n",
  ],
  [
    "factories evaluate once in receiver then predicate order",
    "#receiver bind: { 'receiver' print. [1, 2] }. #predicate bind: { 'predicate' print. { x -> $x print. $True } }. (($receiver value) filter: ($predicate value)) length print.",
    "receiver\npredicate\n1\n2\n2\n",
  ],
  [
    "callbacks have separate environments and inherited lexical self",
    "#saved bind: $Object clone. [1, 2] filter: { x -> $saved at: ($x toString) put: { $x }. $True }. (($saved at: '2') value) print. (($saved at: '1') value) print. #parent bind: $Object clone. $parent at: 'name' put: 'parent'. $parent at: 'run' put: { [1] filter: { x -> $self name print. $True } }. #child bind: $parent clone. $child at: 'name' put: 'child'. (($child run) at: 0) print.",
    "2\n1\nchild\n1\n",
  ],
  [
    "snapshot follows predicate expression evaluation",
    "#source bind: [1, 2]. #make bind: { $source at: 0 put: 7. { x -> $x greaterThan: 3 } }. #r bind: ($source filter: $make value). $r length print. ($r at: 0) print.",
    "1\n7\n",
  ],
  [
    "later predicate visits see shared object mutations",
    "#o bind: $Object clone. $o at: 'n' put: 0. #r bind: ([$o, $o] filter: { x -> $x at: 'n' put: ($x n add: 1). $x n equals: 2 }). $r length print. ($r at: 0) n print. $o n print.",
    "1\n2\n2\n",
  ],
  [
    "filter composes with map and reduce",
    "#r bind: (([1, 2, 3, 4] filter: { x -> $x greaterThan: 2 }) map: { x -> $x multiplyBy: 10 }). ($r reduce: 0 with: { total,x -> $total add: $x }) print.",
    "70\n",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`array filter:: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

Deno.test("filter: rejects a non-block even for empty input", async () => {
  const result = await execute("[] filter: 1.");
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /fixture\.toss:1:4: RuntimeError: Block argument required\./,
  );
});

Deno.test("filter: unused wrong arity is accepted, invoked wrong arity fails", async () => {
  const empty = await execute("[] filter: { a, b -> $True }.");
  assert.equal(empty.code, 0, text(empty.stderr));
  const nonempty = await execute("[1] filter: { a, b -> $True }.");
  assert.notEqual(nonempty.code, 0);
  assert.match(
    text(nonempty.stderr),
    /fixture\.toss:1:5: RuntimeError: Block expects 2 argument\(s\), received 1\./,
  );
});

for (
  const value of [
    "0",
    "1",
    "''",
    "'text'",
    "$Nil",
    "[]",
    "#tag",
    "{ 1 }",
    "$Object clone",
  ] as const
) {
  Deno.test(`filter: rejects non-Boolean result ${value}`, async () => {
    const result = await execute(`[1] filter: { x -> ${value} }.`);
    assert.notEqual(result.code, 0);
    assert.match(
      text(result.stderr),
      /RuntimeError: Boolean result required\./,
    );
  });
}

Deno.test("filter: return errors use send location and stop before later calls", async () => {
  const result = await execute(
    "'before' print.\n  [1, 2, 3] filter: { x -> $x print. ($x equals: 2) ifTrue: { 0 } ifFalse: { $True } }.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "before\n1\n2\n");
  assert.match(
    text(result.stderr),
    /fixture\.toss:2:13: RuntimeError: Boolean result required\./,
  );
});

Deno.test("filter: callback errors stop and retain body source position", async () => {
  const result = await execute(
    "[1, 2, 3] filter: { x ->\n  $x print.\n  ($x equals: 2) ifTrue: { $missing } ifFalse: { $True }\n}.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "1\n2\n");
  assert.match(
    text(result.stderr),
    /fixture\.toss:3:28: RuntimeError: Unbound name "missing"\./,
  );
});

Deno.test("filter: argument and arity errors use later-line send position", async () => {
  const invalid = await execute("'before' print.\n  [] filter: 1.");
  assert.notEqual(invalid.code, 0);
  assert.match(
    text(invalid.stderr),
    /fixture\.toss:2:6: RuntimeError: Block argument required\./,
  );
  const arity = await execute("'before' print.\n  [1] filter: { }.");
  assert.notEqual(arity.code, 0);
  assert.match(
    text(arity.stderr),
    /fixture\.toss:2:7: RuntimeError: Block expects 0 argument\(s\), received 1\./,
  );
});
