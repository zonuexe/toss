import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  ["empty input", "#r bind: ([] map: { x -> $x }). $r length print.", "0\n"],
  [
    "results preserve order and values",
    "#r bind: ([1, 2, 3] map: { x -> $x print. $x multiplyBy: 2 }). ($r at: 0) print. ($r at: 1) print. ($r at: 2) print.",
    "1\n2\n3\n2\n4\n6\n",
  ],
  [
    "fresh result and source is unchanged",
    "#source bind: [1, 2]. #result bind: ($source map: { x -> $x }). $result at: 0 put: 9. ($source at: 0) print. ($result at: 0) print.",
    "1\n9\n",
  ],
  [
    "callbacks receive nested values by reference",
    "#item bind: $Object clone. $item at: 'n' put: 1. #source bind: [$item]. #result bind: ($source map: { x -> $x at: 'n' put: 7 }). (($source at: 0) at: 'n') print.",
    "7\n",
  ],
  [
    "snapshot keeps original slots during callback mutation",
    "#source bind: [1, 2]. #result bind: ($source map: { x -> $source at: 1 put: 8. $x }). ($result at: 1) print.",
    "2\n",
  ],
  [
    "inherited method callbacks keep lexical self",
    "#parent bind: $Object clone. $parent at: 'name' put: 'parent'. $parent at: 'run' put: { [1] map: { x -> $self name } }. #child bind: $parent clone. $child at: 'name' put: 'child'. (($child run) at: 0) print.",
    "child\n",
  ],
  [
    "retained callbacks keep separate invocation environments",
    "#callbacks bind: ([1, 2] map: { x -> { $x } }). (($callbacks at: 1) value) print. (($callbacks at: 0) value) print.",
    "2\n1\n",
  ],
  [
    "factory receiver and callback evaluate once left to right",
    "#receiver bind: { 'receiver' print. [1, 2] }. #callback bind: { 'callback' print. { x -> $x print } }. (($receiver value) map: ($callback value)) length print.",
    "receiver\ncallback\n1\n2\n2\n",
  ],
  [
    "snapshot retains shared nested object references",
    "#item bind: $Object clone. $item at: 'n' put: 0. #r bind: ([$item, $item] map: { x -> $x at: 'n' put: ($x n add: 1) }). ($r at: 0) print. ($r at: 1) print. $item n print.",
    "1\n2\n2\n",
  ],
  [
    "snapshot follows callback expression evaluation",
    "#source bind: [1, 2]. #make bind: { $source at: 0 put: 7. { x -> $x } }. #r bind: ($source map: $make value). ($r at: 0) print.",
    "7\n",
  ],
  [
    "results retain all value kinds and identities",
    "#o bind: $Object clone. $o at: 'n' put: 7. #a bind: [9]. #r bind: ([$Nil, $True, $o, $a, { 11 }] map: { x -> $x }). ($r at: 0) dump. ($r at: 1) not print. ($r at: 2) at: 'n' put: 10. $o n print. ($r at: 3) at: 0 put: 8. ($a at: 0) print. ($r at: 4) value print.",
    "nil\nfalse\n10\n8\n11\n",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`array map: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

Deno.test("map: rejects a non-block even for empty input", async () => {
  const result = await execute("[] map: 1.");
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /fixture\.toss:1:4: RuntimeError: Block argument required\./,
  );
});

Deno.test("map: checks arity only when an element invokes the block", async () => {
  const empty = await execute("[] map: { first, second -> $first }.");
  assert.equal(empty.code, 0, text(empty.stderr));
  const nonempty = await execute("[1] map: { first, second -> $first }.");
  assert.notEqual(nonempty.code, 0);
  assert.match(
    text(nonempty.stderr),
    /fixture\.toss:1:5: RuntimeError: Block expects 2 argument\(s\), received 1\./,
  );
});

Deno.test("map: reports body errors and stops after the failing element", async () => {
  const result = await execute(
    "[1, 2, 3] map: { x -> $x print. ($x equals: 2) ifTrue: { $missing } ifFalse: { $x } }.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "1\n2\n");
  assert.match(text(result.stderr), /Unbound name "missing"/);
});

Deno.test("map: body errors retain original positions", async () => {
  const result = await execute("[1] map: { x ->\n  $missing\n}.");
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /fixture\.toss:2:3: RuntimeError: Unbound name "missing"\./,
  );
});

Deno.test("map: arity errors retain later-line send positions", async () => {
  const result = await execute("'before' print.\n  [1] map: { }.");
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "before\n");
  assert.match(
    text(result.stderr),
    /fixture\.toss:2:7: RuntimeError: Block expects 0 argument\(s\), received 1\./,
  );
});
