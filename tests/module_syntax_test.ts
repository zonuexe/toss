import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute } from "./helpers.ts";

const invalid = [
  "%import().",
  "%import('./a.toss', './b.toss').",
  "%import($path).",
  "%import('./a').",
  "{%export(1)}.",
  "{%export(1)} %export(2).",
  "%export(1),.",
  "%export().",
  "%export(1, 2).",
] as const;

for (const source of invalid) {
  Deno.test(`rejects invalid module syntax ${source}`, () => {
    assert.throws(() => compile(source, "module.toss"), TossSyntaxError);
  });
}

Deno.test("keeps import and export names as ordinary named symbols", async () => {
  const result = await execute("#import print. #export print.");

  assert.equal(result.code, 0);
  assert.equal(new TextDecoder().decode(result.stdout), "import\nexport\n");
});

Deno.test("pure compilation rejects unresolved imports while preserving ordinary compilation", async () => {
  assert.throws(
    () => compile("%import('./dep.toss').", "entry.toss"),
    (error: unknown) =>
      error instanceof TossSyntaxError && error.message.includes("compileFile"),
  );
  const result = await execute("'single file' print.");
  assert.equal(result.code, 0);
  assert.equal(new TextDecoder().decode(result.stdout), "single file\n");
});
