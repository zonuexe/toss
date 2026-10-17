import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  ["empty and mixed", "#empty bind: []. $empty length print.", "0\n"],
  [
    "elements and nested arrays",
    "#a bind: [1, 'x', [2]]. $a length print. ($a at: 0) print. (($a at: 2) at: 0) print.",
    "3\n1\n2\n",
  ],
  [
    "keyword elements",
    "#a bind: [(1 add: 2), (3 multiplyBy: 4)]. ($a at: 0) print. ($a at: 1) print.",
    "3\n12\n",
  ],
  [
    "bare keyword elements",
    "#a bind: [1 add: 2, 3 multiplyBy: 4]. ($a at: 0) print. ($a at: 1) print.",
    "3\n12\n",
  ],
  [
    "pipeline array elements",
    "#x bind: 0. #a bind: [1 |> #x bind:, $x]. ($a at: 0) print. ($a at: 1) print.",
    "1\n1\n",
  ],
  [
    "block commas remain parameters",
    "#a bind: [{ first, second -> $first add: $second }]. (($a at: 0) value: 2 value: 3) print.",
    "5\n",
  ],
  [
    "fresh literals and alias mutation",
    "#make bind: { [1] }. #a bind: $make value. #b bind: $a. $b at: 0 put: 9. ($a at: 0) print. (($make value) at: 0) print.",
    "9\n1\n",
  ],
  [
    "elements evaluate once from left to right",
    "#x bind: 0. #a bind: [#x bind: 1, #x bind: 2, $x]. ($a at: 0) print. ($a at: 1) print. ($a at: 2) print.",
    "1\n2\n2\n",
  ],
  [
    "mutations return and preserve length",
    "#a bind: [1, 2]. ($a at: 1 put: 8) print. $a length print. ($a at: 1) print.",
    "8\n2\n8\n",
  ],
  [
    "Nil and Block values remain data",
    "#a bind: [$Nil, { 'called' print }]. ($a at: 0) print. ($a at: 1) value.",
    "nil\ncalled\n",
  ],
  [
    "safe zero indexes",
    "#a bind: ['zero']. ($a at: -0) print. ($a at: 0 put: 'ok') print.",
    "zero\nok\n",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`arrays: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

for (const bad of ["-1", "1.5", "9007199254740992", "2", "'0'", "{ }"]) {
  for (const selector of ["at:", "at:put:"]) {
    Deno.test(`arrays reject ${bad} with ${selector}`, async () => {
      const send = selector === "at:" ? `at: ${bad}` : `at: ${bad} put: 'x'`;
      const result = await execute(`#a bind: [1]. $a ${send}.`);
      assert.notEqual(result.code, 0);
      assert.match(
        text(result.stderr),
        /Array index must be a nonnegative safe integer|Array index is out of bounds/,
      );
      assert.doesNotMatch(text(result.stderr), /program\.js/);
    });
  }
}

Deno.test("arrays reject native methods and object-style dispatch", async () => {
  for (const message of ["map", "push", "constructor", "__proto__", "clone"]) {
    const result = await execute(`[] ${message}.`);
    assert.notEqual(result.code, 0);
    assert.match(
      text(result.stderr),
      new RegExp(`Unknown message ".*${message}.*" for Array`),
    );
    assert.match(text(result.stderr), /fixture\.toss:1:4: RuntimeError:/);
  }
});

Deno.test("array construction stops at the first element error", async () => {
  const result = await execute("['before' print, $missing].");
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "before\n");
  assert.match(text(result.stderr), /Unbound name "missing"/);
});

Deno.test("array send errors retain the later line and send position", async () => {
  const result = await execute("#a bind: [1].\n$a at: 1.");
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /fixture\.toss:2:4: RuntimeError: Array index is out of bounds\./,
  );
});

Deno.test("arrays cannot be object keys", async () => {
  const result = await execute("$Object at: [] put: 1.");
  assert.notEqual(result.code, 0);
  assert.match(text(result.stderr), /Object key must be a string or symbol/);
});
