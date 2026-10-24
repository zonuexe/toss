import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compile, compileFile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { runCli, text } from "./helpers.ts";

async function importedValue(source: string): Promise<unknown> {
  const directory = await Deno.makeTempDir({ prefix: "toss-esm-value-" });
  try {
    const output = join(directory, "module.js");
    await Deno.writeTextFile(
      output,
      compile(source, "entry.toss", { format: "esm" }),
    );
    return (await import(pathToFileURL(output).href)).default;
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}

Deno.test("ESM compile exports converted Toss values and stable callback wrappers", async () => {
  assert.equal(await importedValue("%export(42)."), 42);
  assert.equal(await importedValue("%export($Nil)."), null);
  assert.deepEqual(await importedValue("%export([1, 2])."), [1, 2]);
  assert.equal(await importedValue("%export(#shared)."), Symbol.for("shared"));
  assert.equal(await importedValue("%export(1). #later bind: 2."), 1);
  const mutated = await importedValue(
    "#value bind: $Object clone. %export($value). $value at: 'name' put: 'changed'.",
  );
  if (typeof mutated !== "object" || mutated === null) {
    throw new TypeError("Expected Object export.");
  }
  assert.equal(Reflect.get(mutated, "name"), "changed");
  assert.deepEqual(await importedValue("%export(%js({ value: 7 }))."), {
    value: 7,
  });

  const callback = await importedValue([
    "#block bind: { amount -> $amount add: 1 }.",
    "#first bind: $block asJSCallback.",
    "#second bind: $block asJSCallback.",
    "%export(%js(first = $first, second = $second; ({ first, same: first === second }))).",
  ].join("\n"));
  if (typeof callback !== "object" || callback === null) {
    throw new TypeError("Expected callback object export.");
  }
  assert.equal(Reflect.get(callback, "same"), true);
  const first = Reflect.get(callback, "first");
  if (typeof first !== "function") {
    throw new TypeError("Expected callback export.");
  }
  assert.equal(Reflect.apply(first, undefined, [2]), 3);
  assert.equal(Reflect.apply(first, undefined, [2]), 3);
});

Deno.test("ESM output initializes the full entry and resolves imported closures privately", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-esm-bundle-" });
  try {
    await Deno.writeTextFile(
      join(directory, "dep.toss"),
      "#secret bind: 40. %export({ value -> $secret add: $value } asJSCallback).",
    );
    await Deno.writeTextFile(
      join(directory, "main.toss"),
      "#callback bind: %import('./dep.toss'). %export($callback). 'after' print.",
    );
    const javascript = await compileFile(
      join(directory, "main.toss"),
      undefined,
      { format: "esm" },
    );
    const output = join(directory, "bundle.js");
    const probe = join(directory, "probe.ts");
    await Deno.writeTextFile(output, javascript);
    await Deno.writeTextFile(
      probe,
      ['import callback from "./bundle.js";', "console.log(callback(2));", ""]
        .join("\n"),
    );
    const result = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-config", "--no-prompt", probe],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "after\n42\n");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("ESM conversion rejects ordinary Blocks and returns Async Block results as Promises", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-esm-async-" });
  try {
    const blockFile = join(directory, "block.js");
    await Deno.writeTextFile(
      blockFile,
      compile("%export({ 1 }).", "block.toss", { format: "esm" }),
    );
    await assert.rejects(
      () => import(pathToFileURL(blockFile).href),
      /Toss Blocks cannot be passed directly to JavaScript/,
    );

    const asyncFile = join(directory, "async.js");
    await Deno.writeTextFile(
      asyncFile,
      compile("%export(%async({ 5 }) value).", "async.toss", { format: "esm" }),
    );
    const result = (await import(pathToFileURL(asyncFile).href)).default;
    assert.ok(result instanceof Promise);
    assert.equal(await result, 5);
    await Deno.writeTextFile(
      asyncFile,
      compile(
        "%export(%async({ 1 divideBy: 0 }) value).",
        "async-reject.toss",
        { format: "esm" },
      ),
    );
    const rejected =
      (await import(`${pathToFileURL(asyncFile).href}?rejected`)).default;
    assert.ok(rejected instanceof Promise);
    await assert.rejects(rejected, /Division by zero/);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("ESM output requires one root export and CLI errors preserve existing output", async () => {
  for (const source of ["1.", "%export(1). %export(2).", "{%export(1)}."]) {
    assert.throws(
      () => compile(source, "entry.toss", { format: "esm" }),
      TossSyntaxError,
    );
  }

  const directory = await Deno.makeTempDir({ prefix: "toss-esm-cli-" });
  try {
    const input = join(directory, "entry.toss");
    const output = join(directory, "output.js");
    await Deno.writeTextFile(input, "1.");
    await Deno.writeTextFile(output, "previous");
    const missingExport = await runCli([
      input,
      "-o",
      output,
      "--format",
      "esm",
    ]);
    assert.notEqual(missingExport.code, 0);
    assert.equal(await Deno.readTextFile(output), "previous");
    for (
      const args of [
        [input, "-o", output, "--format", "invalid"],
        [input, "-o", output, "--format"],
        [input, "-o", output, "--format", "esm", "--format", "program"],
      ]
    ) {
      const invalid = await runCli(args);
      assert.notEqual(invalid.code, 0);
    }
    await Deno.writeTextFile(input, "%export(7).");
    const program = await runCli([input, "-o", output, "--format", "program"]);
    assert.equal(program.code, 0, text(program.stderr));
    const outputModule = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-config", "--no-prompt", output],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(outputModule.code, 0, text(outputModule.stderr));
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("ESM conversion runs after entry effects and reports later initialization errors first", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-esm-order-" });
  try {
    for (
      const [name, source] of [
        ["block", "%export({ 1 }). 'after' print."],
        ["broken", "%export({ 1 }). $missing."],
      ] as const
    ) {
      const modulePath = join(directory, `${name}.js`);
      const probePath = join(directory, `${name}.ts`);
      await Deno.writeTextFile(
        modulePath,
        compile(source, "entry.toss", { format: "esm" }),
      );
      await Deno.writeTextFile(
        probePath,
        [
          `import("./${name}.js").catch((error) => console.log(error.message));`,
          "",
        ].join("\n"),
      );
      const result = await new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--no-config",
          "--no-prompt",
          `--allow-read=${directory}`,
          probePath,
        ],
        stdout: "piped",
        stderr: "piped",
      }).output();
      assert.equal(result.code, 0, text(result.stderr));
      const stdout = text(result.stdout);
      if (name === "block") {
        assert.match(
          stdout,
          /^after\nentry\.toss:1:1: RuntimeError: Toss Blocks/,
        );
      } else {
        assert.match(
          stdout,
          /entry\.toss:1:\d+: RuntimeError: Unbound name "missing"/,
        );
      }
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
