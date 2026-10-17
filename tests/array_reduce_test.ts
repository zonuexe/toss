import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  [
    "empty returns the initial value",
    "([] reduce: 9 with: { sum, x -> $sum add: $x }) print.",
    "9\n",
  ],
  [
    "singleton and explicit initial value",
    "([5] reduce: 20 with: { sum, x -> $sum subtract: $x }) print. ([9, 2, 1] reduce: 20 with: { sum, x -> $sum subtract: $x }) print.",
    "15\n8\n",
  ],
  [
    "left fold order differs from reverse traversal and swapped arguments",
    "([1, 2, 3] reduce: 4 with: { acc, x -> ($acc multiplyBy: 10) add: $x }) print.",
    "4123\n",
  ],
  [
    "snapshot follows initial and callback expression evaluation",
    "#source bind: [1, 2]. ($source reduce: ({ $source at: 0 put: 7. 0 } value) with: ({ $source at: 1 put: 8. { acc,x -> $acc add: $x } } value)) print.",
    "15\n",
  ],
  [
    "Nil and Symbol accumulators retain their types",
    "([1] reduce: $Nil with: { acc,x -> $acc }) dump. ([1] reduce: #tag with: { acc,x -> $acc }) dump.",
    "nil\n#tag\n",
  ],
  [
    "Array accumulators keep nested results",
    "#result bind: ([1, 2] reduce: [] with: { acc,x -> [$acc, $x] }). ($result at: 1) print. (($result at: 0) at: 1) print. ((($result at: 0) at: 0) length) print.",
    "2\n1\n0\n",
  ],
  [
    "accumulator can be any value",
    "([1] reduce: $False with: { state, x -> $state not }) print. (([1, 2] reduce: { 3 } with: { state, x -> { $x } }) value) print. #object bind: $Object clone. $object at: 'n' put: 0. ([1, 2] reduce: $object with: { state, x -> $state at: 'n' put: ($state n add: $x). $state }) n print.",
    "true\n2\n3\n",
  ],
  [
    "empty retains initial object identity and wrong arity is unused",
    "#object bind: $Object clone. #result bind: ([] reduce: $object with: { only -> $only }). $result at: 'n' put: 4. $object n print.",
    "4\n",
  ],
  [
    "source is unchanged and explicit mutation works",
    "#source bind: [1, 2]. ($source reduce: 0 with: { sum, x -> $sum add: $x }) print. ($source at: 0) print. ($source reduce: 0 with: { sum, x -> $source at: 0 put: 8. $sum add: $x }) print. ($source at: 0) print.",
    "3\n1\n3\n8\n",
  ],
  [
    "snapshot protects replaced slots and keeps nested references live",
    "#source bind: [1, 2, 3]. ($source reduce: 0 with: { sum, x -> $source at: 2 put: 99. $sum add: $x }) print. ($source at: 2) print. #item bind: $Object clone. $item at: 'n' put: 1. ([$item] reduce: 0 with: { sum, x -> $x at: 'n' put: 7. $x n }) print. ($item n) print.",
    "6\n99\n7\n7\n",
  ],
  [
    "effects occur in order and callback return becomes accumulator",
    "#source bind: [1, 2, 3]. ($source reduce: 10 with: { sum, x -> $x print. $sum add: $x }) print.",
    "1\n2\n3\n16\n",
  ],
  [
    "factories evaluate once left to right",
    "#receiver bind: { 'receiver' print. [1, 2] }. #initial bind: { 'initial' print. 0 }. #callback bind: { 'callback' print. { sum, x -> $sum add: $x } }. (($receiver value) reduce: ($initial value) with: ($callback value)) print.",
    "receiver\ninitial\ncallback\n3\n",
  ],
  [
    "callbacks retain separate invocation environments",
    "#callbacks bind: ([1, 2] reduce: [] with: { results, x -> [$results, { $x }] }). #last bind: ($callbacks at: 1). #previous bind: (($callbacks at: 0) at: 1). ($last value) print. ($previous value) print.",
    "2\n1\n",
  ],
  [
    "inherited method callback keeps lexical self",
    "#parent bind: $Object clone. $parent at: 'name' put: 'parent'. $parent at: 'run' put: { [1] reduce: 0 with: { sum, x -> $self name print. $sum add: 1 } }. #child bind: $parent clone. $child at: 'name' put: 'child'. ($child run) print.",
    "child\n1\n",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`array reduce:with:: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

Deno.test("reduce:with: rejects a non-block even for empty input", async () => {
  const result = await execute("[] reduce: 0 with: 1.");
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /fixture\.toss:1:4: RuntimeError: Block argument required\./,
  );
});

Deno.test("reduce:with: checks arity only when an element invokes the block", async () => {
  const empty = await execute("[] reduce: 0 with: { only -> $only }.");
  assert.equal(empty.code, 0, text(empty.stderr));
  const nonempty = await execute("[1] reduce: 0 with: { only -> $only }.");
  assert.notEqual(nonempty.code, 0);
  assert.match(
    text(nonempty.stderr),
    /fixture\.toss:1:5: RuntimeError: Block expects 1 argument\(s\), received 2\./,
  );
});

Deno.test("reduce:with: body errors stop iteration and preserve body location", async () => {
  const result = await execute(
    "[1, 2, 3] reduce: 0 with: { sum, x ->\n  $x print.\n  ($x equals: 2) ifTrue: { $missing } ifFalse: { $sum add: $x }\n}.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "1\n2\n");
  assert.match(
    text(result.stderr),
    /fixture\.toss:3:28: RuntimeError: Unbound name "missing"\./,
  );
});

Deno.test("reduce:with: argument and arity errors use send position", async () => {
  const invalid = await execute("'before' print.\n  [] reduce: 0 with: 1.");
  assert.notEqual(invalid.code, 0);
  assert.equal(text(invalid.stdout), "before\n");
  assert.match(
    text(invalid.stderr),
    /fixture\.toss:2:6: RuntimeError: Block argument required\./,
  );
  const arity = await execute("'before' print.\n  [1] reduce: 0 with: { }.");
  assert.notEqual(arity.code, 0);
  assert.match(
    text(arity.stderr),
    /fixture\.toss:2:7: RuntimeError: Block expects 0 argument\(s\), received 2\./,
  );
});
