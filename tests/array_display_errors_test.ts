import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

Deno.test("ordinary Object and Block values have default inspection", async () => {
  const result = await execute(
    "[($Object clone), { 'unused' print }, %async({ 1 })] dump.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "[<object>, <block>, <block>]\n");
  assert.equal(text(result.stderr), "");
});

Deno.test("invalid custom inspect result reports array send location", async () => {
  const result = await execute(
    "#o bind: $Object clone. $o at: 'inspect' put: { 1 }. [$o] dump.",
  );
  assert.notEqual(result.code, 0);
  assert.match(text(result.stderr), /inspect must return a string\./);
  assert.match(text(result.stderr), /fixture\.toss:1:59: RuntimeError:/);
});

Deno.test("later elements are not inspected after an error", async () => {
  const result = await execute(
    "#o bind: $Object clone. $o at: 'inspect' put: { $missing }. #later bind: $Object clone. $later at: 'inspect' put: { 'later' print. 'ok' }. [$o, $later] dump.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(text(result.stderr), /Unbound name "missing"/);
});
