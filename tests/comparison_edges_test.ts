import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, text } from "./helpers.ts";

const cases = [
  [
    "both comparison operands evaluate once from left to right",
    "#left bind: $Object clone. #right bind: $Object clone. $left at: 'add:' put: { x -> 'left' print. $x }. $right at: 'add:' put: { x -> 'right' print. $x }. $($left+1 < $right+2) print.",
    "left\nright\ntrue\n",
  ],
  [
    "negative zero compares numerically",
    "[$(-0==0), $(-0!=0), $(-0<=0), $(-0>=0)] dump.",
    "[true, false, true, true]\n",
  ],
  [
    "arithmetic on both sides precedes comparison",
    "[$(1+2<2*2), $(10/2==6-1), $(9%4!=2*2)] dump.",
    "[true, true, true]\n",
  ],
  [
    "not equals uses the returned object's ordinary not method",
    "#result bind: $Object clone. $result at: 'not' put: { 'not' print. 'done' }. #o bind: $Object clone. $o at: 'equals:' put: { x -> $x print. $result }. $($o!=7) print.",
    "7\nnot\ndone\n",
  ],
  [
    "comparison preserves custom method return values",
    "#o bind: $Object clone. $o at: 'lessThan:' put: { x -> 'custom' }. $($o<1) print.",
    "custom\n",
  ],
  [
    "comparison result can enter a pipeline",
    "$(1<2) |> #answer bind:. $answer ifTrue: { 'yes' print }.",
    "yes\n",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`comparison macro: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

for (
  const source of ["$(1<2==3).", "$(1==2<3).", "$(1!=2>=3).", "$(1<=2>3)."]
) {
  Deno.test(`mixed comparison chain is rejected: ${source}`, () => {
    assert.throws(() => compile(source, "chain.toss"), TossSyntaxError);
  });
}

for (const receiver of ["$True", "'x'", "[]", "$Nil"]) {
  Deno.test(`comparison does not add equality for ${receiver}`, async () => {
    const result = await execute(`#x bind: ${receiver}. $($x==$x) print.`);
    assert.notEqual(result.code, 0);
    assert.match(text(result.stderr), /Unknown message "equals:"/);
  });
}

Deno.test("explicit comparison grouping uses ordinary Boolean dispatch", async () => {
  const result = await execute("$((1<2)==$True) print.");
  assert.notEqual(result.code, 0);
  assert.match(text(result.stderr), /Unknown message "equals:" for Boolean/);
});

Deno.test("comparison method failures retain body locations", async () => {
  const result = await execute(
    "#o bind: $Object clone.\n$o at: 'equals:' put: { x ->\n  $missing\n}.\n$($o!=1) print.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(
    text(result.stderr),
    /fixture\.toss:3:3: RuntimeError: Unbound name "missing"\./,
  );
});

Deno.test("second chained comparator keeps its CRLF source location", () => {
  assert.throws(
    () => compile("'before'.\r\n  $(1 < 2 == 3).", "chain.toss"),
    (error: unknown) => {
      assert.ok(error instanceof TossSyntaxError);
      assert.deepEqual(error.location, {
        file: "chain.toss",
        line: 2,
        column: 11,
      });
      return true;
    },
  );
});
