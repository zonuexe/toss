import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  compile,
  compileFile,
  generateRuntimeModule,
} from "../src/compiler.ts";
import { runCli, text } from "./helpers.ts";

Deno.test("external runtime asset runs generated artifacts with private roots", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-runtime-module-" });
  try {
    await Deno.writeTextFile(
      join(directory, "runtime.js"),
      generateRuntimeModule(),
    );
    await Deno.writeTextFile(
      join(directory, "dep.toss"),
      "#state bind: $Object clone. $state at: 'count' put: 40. %export({ value -> $state at: 'count' put: (($state at: 'count') add: $value). $state at: 'count' } asJSCallback).",
    );
    await Deno.writeTextFile(
      join(directory, "first.toss"),
      "#callback bind: %import('./dep.toss'). %export($callback).",
    );
    await Deno.writeTextFile(
      join(directory, "second.toss"),
      "#callback bind: %import('./dep.toss'). %export($callback).",
    );
    await Deno.writeTextFile(
      join(directory, "async.toss"),
      "#block bind: %async({ value -> $value add: 1 }). #callback bind: $block asJSCallback. %export($callback).",
    );
    const first = await compileFile(join(directory, "first.toss"), undefined, {
      format: "esm",
      runtimeImport: "./runtime.js",
    });
    const second = await compileFile(
      join(directory, "second.toss"),
      undefined,
      {
        format: "esm",
        runtimeImport: "./runtime.js",
      },
    );
    const asynchronous = await compileFile(
      join(directory, "async.toss"),
      undefined,
      { format: "esm", runtimeImport: "./runtime.js" },
    );
    await Deno.writeTextFile(join(directory, "first.js"), first);
    await Deno.writeTextFile(join(directory, "second.js"), second);
    await Deno.writeTextFile(join(directory, "async.js"), asynchronous);
    const referenceSource = "%export([%js(globalThis), %js(globalThis)]).";
    for (const name of ["reference-first", "reference-second"]) {
      await Deno.writeTextFile(
        join(directory, `${name}.js`),
        compile(referenceSource, `${name}.toss`, {
          format: "esm",
          runtimeImport: "./runtime.js",
        }),
      );
    }

    const callback = (await import(
      pathToFileURL(join(directory, "first.js"))
        .href
    )).default;
    const secondValue = (await import(
      pathToFileURL(join(directory, "second.js"))
        .href
    )).default;
    const asyncCallback = (await import(
      pathToFileURL(join(directory, "async.js"))
        .href
    )).default;
    const firstReferences = (await import(
      pathToFileURL(join(directory, "reference-first.js"))
        .href
    )).default;
    const secondReferences = (await import(
      pathToFileURL(join(directory, "reference-second.js"))
        .href
    )).default;
    if (
      typeof firstReferences !== "object" || firstReferences === null ||
      typeof secondReferences !== "object" || secondReferences === null
    ) throw new TypeError("Expected exported reference arrays.");
    assert.equal(typeof callback, "function");
    assert.equal(Reflect.apply(callback, undefined, [2]), 42);
    assert.equal(Reflect.apply(callback, undefined, [2]), 44);
    assert.equal(Reflect.apply(secondValue, undefined, [2]), 42);
    assert.equal(await Reflect.apply(asyncCallback, undefined, [2]), 3);
    assert.equal(
      Reflect.get(firstReferences, 0),
      Reflect.get(firstReferences, 1),
    );
    assert.notEqual(
      Reflect.get(firstReferences, 0),
      Reflect.get(secondReferences, 0),
    );
    assert.match(first, /from "\.\/runtime\.js"/);
    assert.doesNotMatch(first, /function evaluateCompiledJavaScript/);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("external runtime import alias avoids decoded JavaScript identifiers", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-runtime-alias-" });
  try {
    await Deno.writeTextFile(
      join(directory, "runtime.js"),
      generateRuntimeModule(),
    );
    const javascript = compile(
      "%export(%js(typeof \\u005f\\u005ftossCreateRuntime)).",
      "alias.toss",
      { format: "esm", runtimeImport: "./runtime.js" },
    );
    const output = join(directory, "alias.js");
    await Deno.writeTextFile(output, javascript);
    assert.equal(
      (await import(pathToFileURL(output).href)).default,
      "undefined",
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("runtime task writes a reusable ESM asset and rejects invalid CLI options", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-runtime-cli-" });
  try {
    const output = join(directory, "nested", "runtime.js");
    const built = await new Deno.Command(Deno.execPath(), {
      args: ["task", "runtime", "-o", output],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(built.code, 0, text(built.stderr));
    assert.equal(await Deno.readTextFile(output), generateRuntimeModule());

    const source = join(directory, "source.toss");
    await Deno.writeTextFile(source, "%export(1).");
    for (const value of ["", " ./runtime.js", "./runtime.js\n"]) {
      const invalid = await runCli([
        source,
        "-o",
        join(directory, "out.js"),
        "--format",
        "esm",
        "--runtime-import",
        value,
      ]);
      assert.notEqual(invalid.code, 0);
    }
    const missing = await runCli([
      source,
      "-o",
      join(directory, "out.js"),
      "--runtime-import",
    ]);
    assert.notEqual(missing.code, 0);

    const program = join(directory, "nested", "program.js");
    const valid = await runCli([
      source,
      "-o",
      program,
      "--format",
      "esm",
      "--runtime-import",
      "./runtime.js",
    ]);
    assert.equal(valid.code, 0, text(valid.stderr));
    assert.equal((await import(pathToFileURL(program).href)).default, 1);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("external runtime instance does not expose runtime locals to JavaScript evaluators", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-runtime-scope-" });
  try {
    await Deno.writeTextFile(
      join(directory, "runtime.js"),
      generateRuntimeModule(),
    );
    const output = join(directory, "scope.js");
    await Deno.writeTextFile(
      output,
      compile("%export(%js(typeof send)).", "scope.toss", {
        format: "esm",
        runtimeImport: "./runtime.js",
      }),
    );
    assert.equal(
      (await import(pathToFileURL(output).href)).default,
      "undefined",
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("embedded compiler output remains independent of runtime asset generation", () => {
  const embedded = compile("'hello' print.", "hello.toss");
  const external = compile("'hello' print.", "hello.toss", {
    runtimeImport: "./runtime.js",
  });
  assert.match(embedded, /function evaluateCompiledJavaScript/);
  assert.match(external, /import \{ createRuntime as /);
  assert.doesNotMatch(external, /function evaluateCompiledJavaScript/);
});

Deno.test("CLI rejects importing its own output as the runtime asset", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "toss-runtime-self-import-",
  });
  try {
    const source = join(directory, "source.toss");
    const output = join(directory, "output.js");
    await Deno.writeTextFile(source, "%export(1).");
    await Deno.writeTextFile(output, "preserved");
    const result = await runCli([
      source,
      "-o",
      output,
      "--format",
      "esm",
      "--runtime-import",
      "./output.js",
    ]);
    assert.notEqual(result.code, 0);
    assert.match(text(result.stderr), /Output must not import itself/);
    assert.equal(await Deno.readTextFile(output), "preserved");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
