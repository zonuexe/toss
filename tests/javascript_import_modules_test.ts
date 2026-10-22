import assert from "node:assert/strict";
import { compileFile } from "../src/module_loader.ts";
import { executeJavaScript, text } from "./helpers.ts";

Deno.test("bundled Toss modules share one static JavaScript import", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-js-import-" });
  try {
    await Deno.writeTextFile(
      `${directory}/dependency.toss`,
      "%export(%jsImport('node:path')).",
    );
    await Deno.writeTextFile(
      `${directory}/main.toss`,
      "#path bind: %import('./dependency.toss'). %jsImport('node:path') dump. %js(path = $path; path.basename('/tmp/bundle')) print.",
    );
    const javascript = await compileFile(`${directory}/main.toss`);
    const result = await executeJavaScript(javascript);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "<js>\nbundle\n");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
