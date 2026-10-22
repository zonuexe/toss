import assert from "node:assert/strict";
import { join } from "node:path";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, runCli, text } from "./helpers.ts";
import { runModuleProgram } from "./module_helpers.ts";

Deno.test("JS import in a JS binding keeps the ordinary value boundary", async () => {
  const source =
    "%js(module = %jsImport('node:path'); module.basename('/tmp/result.txt')) print.";

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "result.txt\n");
});

Deno.test("JS loading fails before Toss side effects when a static dependency is missing", async () => {
  const source =
    "'must not run' print. #unused bind: { %jsImport('node:toss_missing_module') }.";

  const result = await execute(source);

  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(text(result.stderr), /toss_missing_module/);
});

Deno.test("JS imports in lazy Toss dependencies still initialize before the entry", async () => {
  const specifier = "data:text/javascript," +
    encodeURIComponent('console.log("host first"); export const value = 7;');
  const files = {
    "main.toss":
      "#unused bind: { %import('./unused.toss') }. 'entry second' print.",
    "unused.toss":
      `%jsImport('${specifier}'). 'must not run' print. %export(0).`,
  };

  const result = await runModuleProgram(files, "main.toss");

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "host first\nentry second\n");
});

Deno.test("JS namespaces share their Toss reference wrapper across bundled files", async () => {
  const files = {
    "main.toss":
      "#a bind: %jsImport('node:path'). #b bind: %import('./lib.toss'). %js(xs = [$a, $b]; xs[0] === xs[1]) print.",
    "lib.toss": "%export(%jsImport('node:path')).",
  };

  const result = await runModuleProgram(files, "main.toss");

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
});

Deno.test("JS namespace exports stay live after a native module mutation", async () => {
  const specifier = "data:text/javascript," + encodeURIComponent(
    "export let count = 1; export function increment() { count += 1; }",
  );
  const source = `#module bind: %jsImport('${specifier}').
%js(module = $module; module.count) print.
%js(module = $module; module.increment()).
%js(module = $module; module.count) print.`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "1\n2\n");
});

Deno.test("JS namespaces remain opaque after macro expansion", async () => {
  const source =
    `%macro(#pathModule, { input -> %quote(%jsImport('node:path')) }).
#module bind: %pathModule().
$module at: 'basename'.`;

  const result = await execute(source);

  assert.notEqual(result.code, 0);
  assert.match(text(result.stderr), /fixture\.toss:3:/);
  assert.match(text(result.stderr), /at:/);
});

Deno.test("invalid JS imports from macro output keep source and expansion positions", () => {
  const source = `%macro(#bad, { input ->
  %quote(%jsImport('./relative.js'))
}).
%bad().`;

  const action = () => compile(source, "import-trace.toss");

  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof TossSyntaxError);
    assert.equal(error.location.line, 2);
    assert.match(error.message, /import-trace\.toss:4:1/);
    assert.match(error.message, /bad/);
    return true;
  });
});

Deno.test("invalid JS import syntax preserves the previous CLI output", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-js-import-cli-" });
  try {
    const input = join(directory, "invalid.toss");
    const output = join(directory, "output.js");
    await Deno.writeTextFile(input, "%jsImport($module).");
    await Deno.writeTextFile(output, "previous output\n");

    const result = await runCli([input, "-o", output]);

    assert.notEqual(result.code, 0);
    assert.equal(await Deno.readTextFile(output), "previous output\n");
    assert.match(text(result.stderr), /invalid\.toss:1:/);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
