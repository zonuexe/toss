import assert from "node:assert/strict";
import { compile as compileFacade } from "../src/compiler.ts";
import { compile } from "../src/source_compiler.ts";
import { executeJavaScript, executeModuleProbe, text } from "./helpers.ts";

Deno.test("source compiler compiles and runs with all permissions denied", async () => {
  const compilerUrl =
    new URL("../src/source_compiler.ts", import.meta.url).href;
  const configPath = new URL("../deno.json", import.meta.url).pathname;
  const script = `import { compile } from ${JSON.stringify(compilerUrl)};\n` +
    `if (Deno.permissions.querySync({ name: "read" }).state !== "prompt") throw new Error("read permission unexpectedly granted");\n` +
    `console.log(compile("%macro(#answer, { s -> %quote(42) }). %answer() print. %js(Math.max(40, 2)) print.", "pure.toss", { treeShakePrelude: true }));\n`;
  const directory = await Deno.makeTempDir({ prefix: "toss-pure-compiler-" });
  try {
    const probe = `${directory}/probe.ts`;
    await Deno.writeTextFile(probe, script);
    const result = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--no-prompt",
        "--config",
        configPath,
        probe,
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(result.code, 0, text(result.stderr));
    const javascript = text(result.stdout).trimEnd();
    const execution = await executeJavaScript(javascript);
    assert.equal(execution.code, 0, text(execution.stderr));
    assert.equal(text(execution.stdout), "42\n40\n");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("source entry supports browser-ready ESM output", async () => {
  const javascript = compile(
    "%export(%js(Math.max(1, 42))).",
    "source-esm.toss",
    { format: "esm" },
  );
  const result = await executeModuleProbe(
    javascript,
    "console.log(namespace.default);",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "42\n");
});

Deno.test("source and facade APIs keep output and diagnostics aligned", () => {
  const source = `%macro(#answer, { s -> %quote(42) }). %answer() print.`;
  assert.equal(
    compile(source, "same.toss", { treeShakePrelude: true }),
    compileFacade(source, "same.toss", { treeShakePrelude: true }),
  );

  for (
    const invalid of [
      "%import('./dependency.toss').",
      "%macroImport('./library.toss').",
      "%export(1). %export(2).",
    ]
  ) {
    const options = invalid.includes("%export")
      ? { format: "esm" as const }
      : {};
    assert.throws(
      () => compile(invalid, "invalid.toss", options),
      (sourceError: unknown) => {
        assert.throws(
          () => compileFacade(invalid, "invalid.toss", options),
          (facadeError: unknown) => {
            assert.equal(
              facadeError instanceof Error ? facadeError.message : facadeError,
              sourceError instanceof Error ? sourceError.message : sourceError,
            );
            return true;
          },
        );
        return true;
      },
    );
  }
});

Deno.test("source entry dependency graph excludes filesystem host modules", async () => {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["info", "--json", "src/source_compiler.ts"],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert.equal(result.code, 0, text(result.stderr));
  const graphText = text(result.stdout);
  const graph: unknown = JSON.parse(graphText);
  assert.ok(typeof graph === "object" && graph !== null);
  const modules: unknown = Reflect.get(graph, "modules");
  assert.ok(Array.isArray(modules));
  const specifiers = modules.flatMap((module: unknown) => {
    if (typeof module !== "object" || module === null) return [];
    const specifier = Reflect.get(module, "specifier");
    return typeof specifier === "string" ? [specifier] : [];
  });
  assert.ok(!specifiers.some((specifier) => specifier.startsWith("node:")));
  assert.ok(
    !specifiers.some((specifier) => specifier.endsWith("/module_loader.ts")),
  );
  assert.ok(
    !specifiers.some((specifier) => specifier.endsWith("/module_output.ts")),
  );
});
