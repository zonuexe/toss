import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  [
    "empty and mixed",
    "[] dump. [1, $True, $Nil, #key, 'a'] dump.",
    '[]\n[1, true, nil, #key, "a"]\n',
  ],
  ["nested arrays and escaping", "[[1], 'a\\\\b'] dump.", '[[1], "a\\\\b"]\n'],
  [
    "print and inspect",
    "[1, 'x'] print. [1, 'x'] inspect print. [1, 'x'] toString print.",
    '[1, "x"]\n[1, "x"]\n[1, "x"]\n',
  ],
  [
    "object custom inspect with inherited self",
    "#p bind: $Object clone. $p at: 'inspect' put: { $self name }. #c bind: $p clone. $c at: 'name' put: 'child'. [$c] dump.",
    "[child]\n",
  ],
  [
    "string inspect slot is data",
    "#o bind: $Object clone. $o at: 'inspect' put: 'stored'. [$o] dump.",
    "[stored]\n",
  ],
  [
    "output returns receiver",
    "#a bind: [1]. #same bind: ($a dump). $same at: 0 put: 2. ($a at: 0) print.",
    "[1]\n2\n",
  ],
  ["self cycle", "#a bind: [$Nil]. $a at: 0 put: $a. $a dump.", "[[...]]\n"],
  ["shared noncyclic arrays", "#a bind: [1]. [$a, $a] dump.", "[[1], [1]]\n"],
  [
    "custom inspect recurses into ancestor",
    "#a bind: [$Nil]. #o bind: $Object clone. $o at: 'inspect' put: { $a inspect }. $a at: 0 put: $o. $a dump.",
    "[[...]]\n",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`array display: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

Deno.test("array display snapshots a nested array when entering it", async () => {
  const result = await execute(
    "#a bind: [1, 2]. #o bind: $Object clone. $o at: 'inspect' put: { $a at: 1 put: 9. 'x' }. [$o, $a] dump.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "[x, [1, 9]]\n");
});
