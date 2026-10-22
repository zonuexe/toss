import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, text } from "./helpers.ts";

Deno.test("nested JS binding errors retain the original Toss source position", async () => {
  const source =
    "'before' print.\n%js(x = 1,\n y = %js(z = $missing; z); x + y).";
  const result = await execute(source);
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "before\n");
  assert.match(
    text(result.stderr),
    /fixture\.toss:3:14: RuntimeError: Unbound/,
  );
});

Deno.test("Toss syntax errors inside JS bindings retain their file line", () => {
  assert.throws(
    () => compile("'before' print.\n%js(x = $; x).", "syntax.toss"),
    (error: unknown) => {
      assert.ok(error instanceof TossSyntaxError);
      assert.equal(error.location.file, "syntax.toss");
      assert.equal(error.location.line, 2);
      assert.equal(error.location.column, 10);
      return true;
    },
  );
});
