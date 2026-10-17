import assert from "node:assert/strict";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { compile } from "../src/compiler.ts";
import { execute, text } from "./helpers.ts";

Deno.test("comparison macro operators, boundaries, and arithmetic precedence", async () => {
  const result = await execute(
    "$(1 < 2) print. $(2 < 2) print. $(2 <= 2) print. $(3 <= 2) print. " +
      "$(3 > 2) print. $(2 > 2) print. $(2 >= 2) print. $(1 >= 2) print. " +
      "$(2 == 2) print. $(2 == 3) print. $(2 != 3) print. $(2 != 2) print. " +
      "$(0 == -0) print. $(-0 <= 0) print. $(1 + 2 * 3 < 8) print. " +
      "$(1 + 2 < 3 * 2) print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(
    text(result.stdout),
    "true\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\nfalse\ntrue\ntrue\ntrue\ntrue\n",
  );
});

Deno.test("comparison macro composes with fetches, arrays, blocks, and conditionals", async () => {
  const result = await execute(
    "#x bind: 4. #y bind: 5. $( $x < $y) print. " +
      "#values bind: [1, 2, 3, 4, 5, 6]. " +
      "($values filter: { n -> $($n % 2 == 0) }) dump. " +
      "($values map: { n -> $($n != 3) }) dump. " +
      "{ $($x < $y) ifTrue: { 'yes' print } ifFalse: { 'no' print } } value.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(
    text(result.stdout),
    "true\n[2, 4, 6]\n[true, true, false, true, true, true]\nyes\n",
  );
});

for (
  const source of [
    "$(1 < 2 < 3).",
    "$(1 == 2 == 3).",
    "$(1 < 2 == 3).",
  ]
) {
  Deno.test(`comparison macro rejects chaining at second operator: ${source}`, () => {
    assert.throws(() => compile(source, "compare.toss"), (error: unknown) => {
      assert.ok(error instanceof TossSyntaxError);
      assert.equal(
        error.location.column,
        source.lastIndexOf(source.includes("==") ? "==" : "<") + 1,
      );
      return true;
    });
  });
}

Deno.test("comparison operator errors and custom methods retain message dispatch", async () => {
  const override = await execute(
    "#p bind: $Object clone. $p at: 'lessThan:' put: { n -> ($self at: 'n') lessThan: $n }. " +
      "#child bind: $p clone. $child at: 'n' put: 6. $($child < 7) print.",
  );
  assert.equal(override.code, 0, text(override.stderr));
  assert.equal(text(override.stdout), "true\n");
  const invalidNot = await execute(
    "#o bind: $Object clone. $o at: 'equals:' put: { n -> 7 }. " +
      "$($o != 1) print.",
  );
  assert.notEqual(invalidNot.code, 0);
  assert.match(text(invalidNot.stderr), /Unknown message "not" for Number/);
  const numberType = await execute("#bad bind: 'bad'. $($bad == 1) print.");
  assert.notEqual(numberType.code, 0);
  assert.match(text(numberType.stderr), /Unknown message "equals:" for String/);
  const argumentType = await execute("#bad bind: 'bad'. $(1 < $bad) print.");
  assert.notEqual(argumentType.code, 0);
  assert.match(text(argumentType.stderr), /Number argument required/);
  assert.match(text(argumentType.stderr), /fixture\.toss:1:23: RuntimeError/);
  const nonNumericValues: readonly string[] = ["$True", "$Nil"];
  for (const value of nonNumericValues) {
    const invalid = await execute(`#bad bind: ${value}. $(1 < $bad) print.`);
    assert.notEqual(invalid.code, 0);
    assert.match(text(invalid.stderr), /Number argument required/);
  }
});

Deno.test("comparison arithmetic arguments run once before dispatch", async () => {
  const result = await execute(
    "#p bind: $Object clone. " +
      "$p at: 'add:' put: { n -> 'argument' print. 2 }. " +
      "$(1 < ($p + 3)) print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "argument\ntrue\n");
});

for (const source of ["$(1 === 2).", "$(1 !== 2).", "$(1 = 2).", "1 < 2."]) {
  Deno.test(`comparison syntax rejects ${source}`, () => {
    assert.throws(() => compile(source, "compare.toss"), TossSyntaxError);
  });
}
