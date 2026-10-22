import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, executeJavaScript, text } from "./helpers.ts";

const dataModule = `data:text/javascript,${
  encodeURIComponent(
    "globalThis.tossImportCount = (globalThis.tossImportCount ?? 0) + 1; export const named = 9; export default 5;",
  )
}`;

Deno.test("static JavaScript imports expose exports through %js", async () => {
  const result = await execute(
    `#module bind: %jsImport('node:path'). %js(m = $module; m.basename('/tmp/file.txt')) print.`,
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "file.txt\n");
});

Deno.test("static imports preserve namespace wrapper identity", async () => {
  const result = await execute(
    "#first bind: %jsImport('node:path'). #second bind: %jsImport('node:path'). %js(a = $first, b = $second; a === b) print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
});

Deno.test("macro generated and quoted imports execute at runtime", async () => {
  const generated = await execute(
    "%macro(#bring, { syntax -> %`(%jsImport('node:path')) }). #module bind: %bring(). %js(m = $module; m.basename('/tmp/generated')) print.",
  );
  assert.equal(generated.code, 0, text(generated.stderr));
  assert.equal(text(generated.stdout), "generated\n");
  const quoted = await execute(
    "%macro(#bring, { syntax -> %quote(%jsImport('node:path')) }). #module bind: %bring(). %js(m = $module; m.basename('/tmp/quoted')) print.",
  );
  assert.equal(quoted.code, 0, text(quoted.stderr));
  assert.equal(text(quoted.stdout), "quoted\n");
});

Deno.test("imports nested in JavaScript bindings and unused Blocks initialize eagerly", async () => {
  const result = await execute(
    `#unused bind: { %jsImport('${dataModule}') }. %js(x = %jsImport('${dataModule}'); x.named + x.default + globalThis.tossImportCount) print.`,
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "15\n");
});

Deno.test("compilation does not execute a JavaScript import", async () => {
  Reflect.set(globalThis, "tossImportCount", 0);
  const javascript = compile(
    `%jsImport('${dataModule}') dump. %js(globalThis.tossImportCount) print.`,
    "imports.toss",
  );
  assert.equal(Reflect.get(globalThis, "tossImportCount"), 0);
  const result = await executeJavaScript(javascript);
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "<js>\n1\n");
});

Deno.test("rejects invalid JavaScript specifiers at their string position", () => {
  for (
    const specifier of [
      "./relative.js",
      "/absolute.js",
      "\\\\server\\file.js",
      "C:/module.js",
      "node:path\n",
    ]
  ) {
    const error = expectSyntaxError(() =>
      compile(`%jsImport('${specifier}').`, "specifier.toss")
    );
    assert.deepEqual(error.location, {
      file: "specifier.toss",
      line: 1,
      column: 11,
    });
  }
  assert.throws(
    () => compile("%jsImport('').", "specifier.toss"),
    TossSyntaxError,
  );
  assert.throws(
    () => compile("%jsImport('node:path', 'node:os').", "specifier.toss"),
    TossSyntaxError,
  );
});

Deno.test("built in cannot be replaced and compile time imports are rejected", () => {
  assert.throws(
    () => compile("%macro(#jsImport, { syntax -> $syntax }).", "override.toss"),
    TossSyntaxError,
  );
  assert.throws(
    () =>
      compile(
        "%macro(#bad, { syntax -> %jsImport('node:path') }). %bad().",
        "compile-time.toss",
      ),
    TossSyntaxError,
  );
});

Deno.test("the named symbol jsImport remains an ordinary value", async () => {
  const result = await execute("#jsImport print.");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "jsImport\n");
});

function expectSyntaxError(action: () => unknown): TossSyntaxError {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof TossSyntaxError);
    return error;
  }
  assert.fail("Expected a TossSyntaxError.");
}
