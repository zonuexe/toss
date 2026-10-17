import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

Deno.test("missing element inspect reports the array send location", async () => {
  const result = await execute("[{}] dump.");
  assert.notEqual(result.code, 0);
  assert.match(text(result.stderr), /Unknown message "inspect" for Block/);
  assert.match(text(result.stderr), /fixture\.toss:1:6: RuntimeError:/);
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
