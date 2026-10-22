import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

for (const expression of ["null", "undefined"]) {
  Deno.test(`JavaScript ${expression} becomes ordinary Toss Nil`, async () => {
    const result = await execute(`%js(${expression}) dump.`);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "nil\n");
  });
}

Deno.test("JavaScript finite Number conversion preserves negative zero", async () => {
  const result = await execute(
    "#zero bind: %js(-0). %js(x = $zero; Object.is(x, -0)) print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
});

Deno.test("JavaScript changes to a passed Toss Object remain visible", async () => {
  const result = await execute(
    "#obj bind: $Object clone. %js(obj = $obj; obj.count = 7). $obj count print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "7\n");
});

Deno.test("JavaScript receives the original Toss Unique Symbol", async () => {
  const result = await execute(
    "#key bind: $Symbol generateUnique. %js(a = $key, b = $key; typeof a === 'symbol' && a === b && Symbol.keyFor(a) === undefined) print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
});
