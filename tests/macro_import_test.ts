import assert from "node:assert/strict";
import { compile, compileFile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { text } from "./helpers.ts";
import { runModuleProgram } from "./module_helpers.ts";

Deno.test("macro library imports are private to each consumer root", async () => {
  const library = "%macro(#offsetBy, { n -> %`((%,($n)) add: $offset) }).";
  const first = await runModuleProgram({
    "main.toss":
      "#offset bind: 10. %macroImport('./macros.toss'). (%offsetBy(1)) print.",
    "macros.toss": library,
  }, "main.toss");
  const second = await runModuleProgram({
    "main.toss":
      "#offset bind: 30. %macroImport('./macros.toss'). (%offsetBy(1)) print.",
    "macros.toss": library,
  }, "main.toss");
  assert.equal(first.code, 0, text(first.stderr));
  assert.equal(second.code, 0, text(second.stderr));
  assert.equal(text(first.stdout), "11\n");
  assert.equal(text(second.stdout), "31\n");
});

Deno.test("one compiled bundle gives each consumer an independent macro context", async () => {
  const result = await runModuleProgram({
    "main.toss":
      "#first bind: %import('./first.toss'). #second bind: %import('./second.toss'). $first print. $second print.",
    "first.toss":
      "#offset bind: 10. %macroImport('./macros.toss'). %export(%offsetBy(1)).",
    "second.toss":
      "#offset bind: 30. %macroImport('./macros.toss'). %export(%offsetBy(1)).",
    "macros.toss": "%macro(#offsetBy, { n -> %`((%,($n)) add: $offset) }).",
  }, "main.toss");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "11\n31\n");
});

Deno.test("generated runtime imports keep consumer-relative resolution", async () => {
  const result = await runModuleProgram({
    "main.toss": "%macroImport('./macros.toss'). %load() print.",
    "macros.toss": "%macro(#load, { s -> %quote(%import('./value.toss')) }).",
    "value.toss": "%export(6).",
  }, "main.toss");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "6\n");
});

Deno.test("macro imports are source ordered, canonical and once per consumer", async () => {
  const result = await runModuleProgram(
    {
      "main.toss":
        "%macroImport('./alias.toss'). %macroImport('./sub/../macros.toss'). %pair(4) print.",
      "macros.toss": "%macro(#pair, { s -> %`([%,($s), %,($s)]) }).",
    },
    "main.toss",
    { "alias.toss": "macros.toss" },
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "[4, 4]\n");
});

Deno.test("macro imports preserve introduced binding hygiene", async () => {
  const result = await runModuleProgram({
    "main.toss":
      "#temp bind: 40. %macroImport('./macros.toss'). %local($temp) print. $temp print.",
    "macros.toss":
      "%macro(#local, { s -> %`({ #temp bind: 2. (%,($s)) add: $temp } value) }).",
  }, "main.toss");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "42\n40\n");
});

Deno.test("macro libraries resolve earlier helpers at their definition site", async () => {
  const result = await runModuleProgram({
    "main.toss": "%macroImport('./macros.toss'). %outer() print.",
    "macros.toss":
      "%macro(#helper, { s -> $s }). %macro(#outer, { s -> %helper(%quote(7)) }).",
  }, "main.toss");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "7\n");
});

Deno.test("macro imports reject use before the directive and namespace collisions", async () => {
  await assert.rejects(
    () =>
      compileFileWith({
        "main.toss": "%identity(1). %macroImport('./macros.toss').",
        "macros.toss": "%macro(#identity, { s -> $s }).",
      }),
    (error: unknown) =>
      error instanceof TossSyntaxError && /not defined/.test(error.message),
  );
  await assert.rejects(
    () =>
      compileFileWith({
        "main.toss":
          "%macroImport('./macros.toss'). %macro(#identity, { s -> $s }).",
        "macros.toss": "%macro(#identity, { s -> $s }).",
      }),
    (error: unknown) =>
      error instanceof TossSyntaxError && /Duplicate macro/.test(error.message),
  );
});

Deno.test("macro libraries reject runtime statements before compilation", async () => {
  await assert.rejects(
    () =>
      compileFileWith({
        "main.toss": "%macroImport('./macros.toss'). 1.",
        "macros.toss":
          "'should not run' print. %macro(#answer, { s -> %quote(42) }).",
      }),
    (error: unknown) =>
      error instanceof TossSyntaxError &&
      /only standalone %macro/.test(error.message),
  );
});

Deno.test("macro import reports malformed paths, missing files and invalid libraries", async () => {
  const invalid = [
    ["%macroImport('macros.toss').", "%macro(#m, { s -> $s })."],
    ["%macroImport('./macros.js').", "%macro(#m, { s -> $s })."],
    ["%macroImport('./missing.toss').", ""],
    ["%macroImport('./macros.toss').", "#runtime bind: 1."],
    ["%macroImport('./macros.toss').", "%macroImport('./nested.toss')."],
    ["%macroImport('./macros.toss').", "%export(1)."],
    ["%macroImport('./macros.toss').", "%import('./runtime.toss')."],
    ["%macroImport('./macros.toss').", "%js()."],
    ["1 %macroImport('./macros.toss').", "%macro(#m, { s -> $s })."],
    ["{%macroImport('./macros.toss')}.", "%macro(#m, { s -> $s })."],
    [
      "%macroImport('./macros.toss').",
      "%macro(#m, { s -> %macroImport('./nested.toss') }).",
    ],
    [
      "%macroImport('./builtins.toss'). 1.",
      "%macro(#macroImport, { s -> $s }).",
    ],
  ] as const;
  for (const [consumer, library] of invalid) {
    await assert.rejects(() =>
      compileFileWith({
        "main.toss": consumer,
        "macros.toss": library,
      }), TossSyntaxError);
  }
});

Deno.test("macro import translates unreadable library paths", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "toss-macro-import-read-",
  });
  try {
    await Deno.writeTextFile(
      `${directory}/main.toss`,
      "%macroImport('./macros.toss'). 1.",
    );
    await Deno.mkdir(`${directory}/macros.toss`);
    await assert.rejects(
      () => compileFile(`${directory}/main.toss`),
      (error: unknown) =>
        error instanceof TossSyntaxError &&
        /Unable to read macro library/.test(error.message),
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("unused quoted macro imports stay inert and empty libraries are accepted", async () => {
  const result = await compileFileWith({
    "main.toss":
      "%macroImport('./empty.toss'). %macroImport('./quoted.toss'). %macro(#consumerUnused, { s -> %quote(%macroImport('./missing.toss')) }). 7.",
    "empty.toss": "",
    "quoted.toss":
      "%macro(#unused, { s -> %quote(%macroImport('./missing.toss')) }).",
  });
  assert.match(result, /7/);
});

Deno.test("generated macro imports are rejected without loading their paths", async () => {
  await assert.rejects(
    () =>
      compileFileWith({
        "main.toss":
          "%macro(#inject, { s -> %quote(%macroImport('./missing.toss')) }). %inject().",
      }),
    (error: unknown) =>
      error instanceof TossSyntaxError &&
      /cannot be generated/.test(error.message),
  );
});

Deno.test("compile requires compileFile for explicit macro imports", () => {
  assert.throws(
    () => compile("%macroImport('./macros.toss').", "main.toss"),
    (error: unknown) =>
      error instanceof TossSyntaxError && /compileFile/.test(error.message),
  );
});

Deno.test("macro import rejects library output overwrite and validates generated await", async () => {
  await assert.rejects(() =>
    compileFileWith({
      "main.toss": "%macroImport('./macros.toss'). 1.",
      "macros.toss": "%macro(#m, { s -> $s }).",
    }, "macros.toss"), /Output must not overwrite/);
  await assert.rejects(() =>
    compileFileWith({
      "main.toss": "%macroImport('./macros.toss'). %await(%bad()).",
      "macros.toss": "%macro(#bad, { s -> %quote(1) }).",
    }), TossSyntaxError);
});

async function compileFileWith(
  files: Readonly<Record<string, string>>,
  output?: string,
): Promise<string> {
  const directory = await Deno.makeTempDir({ prefix: "toss-macro-import-" });
  try {
    for (const [path, source] of Object.entries(files)) {
      const target = `${directory}/${path}`;
      const slash = target.lastIndexOf("/");
      await Deno.mkdir(target.slice(0, slash), { recursive: true });
      await Deno.writeTextFile(target, source);
    }
    return await compileFile(
      `${directory}/main.toss`,
      output === undefined ? undefined : `${directory}/${output}`,
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}
