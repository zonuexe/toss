import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

Deno.test("Symbol identity can select original unique keys in a collection", async () => {
  const result = await execute(
    "#one bind: $Symbol generateUnique. #two bind: $Symbol generateUnique. #keys bind: [$one,$two,$one]. ($keys filter: { key -> $key equals: $one }) length print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "2\n");
});

Deno.test("Symbol comparison evaluates receiver and argument once in order", async () => {
  const result = await execute(
    "#key bind: $Symbol generateUnique. #left bind: { 'left' print. $key }. #right bind: { 'right' print. $key }. (($left value) equals: $right value) print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "left\nright\ntrue\n");
});

Deno.test("Symbol argument validation follows argument effects", async () => {
  const result = await execute(
    "#name equals: 'argument' print. 'after' print.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "argument\n");
  assert.match(text(result.stderr), /Symbol argument required/);
});
