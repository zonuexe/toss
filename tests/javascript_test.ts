import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, text } from "./helpers.ts";

Deno.test("JavaScript expression runs in the host context", async () => {
  const result = await execute("%js(Math.max(4, 9)) print.");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "9\n");
});

Deno.test("JavaScript arguments do not expose Toss binding inputs", async () => {
  const result = await execute("%js(value = 7; arguments.length) print.");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "0\n");
});

Deno.test("Toss binding values enter JavaScript once", async () => {
  const result = await execute(
    "%js(first = ('first' print), second = ('second' print); first + second) print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "first\nsecond\nfirstsecond\n");
});

Deno.test("JavaScript bindings are immutable strict locals", async () => {
  const result = await execute("%js(value = 1; value = 2). 'after' print.");
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(text(result.stderr), /fixture\.toss:1:\d+: RuntimeError:/);
});

Deno.test("JavaScript assignment without a separator stays JavaScript", async () => {
  const result = await execute("%js(globalThis.tossJsAssignment = 8) print.");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "8\n");
});

for (
  const source of ["%js().", "%js(1; 2).", "%js(await Promise.resolve(1))."]
) {
  Deno.test(`rejects invalid JavaScript expressions: ${source}`, () => {
    assert.throws(() => compile(source, "javascript.toss"), TossSyntaxError);
  });
}
