import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compile } from "../src/compiler.ts";
import { executeModuleProbe, text } from "./helpers.ts";

Deno.test("ESM JavaScript expressions run without eval or Function", async () => {
  const javascript = compile(
    "%export(%js(Math.max(1, 2))).",
    "aot-esm.toss",
    { format: "esm" },
  );
  assert.doesNotMatch(javascript, /\bFunction\s*\(/);
  const result = await executeModuleProbe(
    javascript,
    "console.log(namespace.default);",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "2\n");
});

Deno.test("AOT dynamic imports retain the generated module base URL", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "toss-esm-dynamic-import-",
  });
  try {
    await Deno.writeTextFile(
      join(directory, "dependency.mjs"),
      "export const answer = 42;\n",
    );
    const output = join(directory, "entry.js");
    await Deno.writeTextFile(
      output,
      compile("%export(%js(import('./dependency.mjs'))).", "entry.toss", {
        format: "esm",
      }),
    );
    const loaded = await import(pathToFileURL(output).href);
    const namespace = await loaded.default;
    assert.equal(Reflect.get(namespace, "answer"), 42);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
