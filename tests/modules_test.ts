import assert from "node:assert/strict";
import {
  output,
  runModuleBoundary,
  runModuleProgram,
} from "./module_helpers.ts";
import { text } from "./helpers.ts";

Deno.test("returns exported values and runs module bodies once across canonical aliases", async () => {
  const result = await runModuleProgram(
    {
      "main.toss":
        "#one bind: %import('./lib/value.toss'). #two bind: %import('./lib/../lib/value.toss'). #three bind: %import('./alias.toss'). $one at: 'value' put: 7. ($three at: 'value') print.",
      "lib/value.toss": "'initialized' print. %export($Object clone).",
    },
    "main.toss",
    { "alias.toss": "lib/value.toss" },
  );

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(output(result), "initialized\n7\n");
});

Deno.test("keeps module bindings private and block exports lexically scoped", async () => {
  const result = await runModuleProgram({
    "main.toss": "#block bind: %import('./private.toss'). $block value print.",
    "private.toss": "#secret bind: 23. %export({ $secret }).",
  }, "main.toss");

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(output(result), "23\n");
});

Deno.test("does not expose entry bindings to dependencies", async () => {
  const privateResult = await runModuleProgram({
    "main.toss": "#secret bind: 'entry'. %import('./reader.toss').",
    "reader.toss": "$secret print. %export(1).",
  }, "main.toss");
  assert.notEqual(privateResult.code, 0);
  assert.match(text(privateResult.stderr), /Unbound name "secret"/);
});

Deno.test("shares named symbol identity across modules", async () => {
  const symbolResult = await runModuleProgram({
    "main.toss": "(%import('./symbol.toss') equals: #shared) print.",
    "symbol.toss": "%export(#shared).",
  }, "main.toss");
  assert.equal(symbolResult.code, 0, text(symbolResult.stderr));
  assert.equal(output(symbolResult), "true\n");
});

Deno.test("supports Nil as an exported value", async () => {
  const result = await runModuleProgram({
    "main.toss": "%import('./nil.toss') print.",
    "nil.toss": "%export($Nil).",
  }, "main.toss");

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(output(result), "nil\n");
});

Deno.test("does not execute unused imports before their expression runs", async () => {
  const result = await runModuleProgram({
    "main.toss": "{ %import('./lazy.toss') }.",
    "lazy.toss": "'loaded' print. %export(1).",
  }, "main.toss");

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(output(result), "");
});

Deno.test("finishes statements after export before returning the recorded value", async () => {
  const result = await runModuleProgram({
    "main.toss": "%import('./after.toss') print.",
    "after.toss": "%export(1). 'after' print. #later bind: 99.",
  }, "main.toss");

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(output(result), "after\n1\n");
});

Deno.test("rejects missing dependencies inside unused blocks", async () => {
  await assert.rejects(() =>
    runModuleProgram({
      "main.toss": "{ %import('./missing.toss') }.",
    }, "main.toss"), /Imported file not found/);
});

Deno.test("rejects static dependency cycles", async () => {
  await assert.rejects(() =>
    runModuleProgram({
      "main.toss": "%import('./cycle.toss').",
      "cycle.toss": "%import('./main.toss'). %export(3).",
    }, "main.toss"), /Static module dependency cycle/);
});

Deno.test("rejects a nonliteral import path with its source location", async () => {
  await assert.rejects(
    () =>
      runModuleProgram({
        "main.toss": "%import($path).",
      }, "main.toss"),
    /main.toss:1:9: SyntaxError: %import requires one string literal path/,
  );
});

Deno.test("requires an imported file to have a top-level export", async () => {
  await assert.rejects(
    () =>
      runModuleProgram({
        "main.toss": "%import('./missing-export.toss').",
        "missing-export.toss": "1 print.",
      }, "main.toss"),
    /must contain exactly one top-level %export/,
  );
});

Deno.test("rejects duplicate exports in an imported file", async () => {
  await assert.rejects(
    () =>
      runModuleProgram({
        "main.toss": "%import('./multiple.toss').",
        "multiple.toss": "%export(1). %export(2).",
      }, "main.toss"),
    /only one %export/,
  );
});

Deno.test("keeps syntax errors attributed to the imported dependency", async () => {
  await assert.rejects(() =>
    runModuleProgram({
      "main.toss": "%import('./broken.toss').",
      "broken.toss": "'valid' print. 'unfinished' print",
    }, "main.toss"), /broken\.toss:1:34: SyntaxError:/);
});

Deno.test("caches a module initialization failure for later imports", async () => {
  const result = await runModuleBoundary(
    {
      "main.toss": "%export({ %import('./failure.toss') }).",
      "failure.toss": "'once' print. %export(1). $unbound.",
    },
    "main.toss",
    `
const entry = moduleStates.get(0).value;
let first;
let second;
try { entry(); } catch (error) { first = error; }
try { entry(); } catch (error) { second = error; }
console.log(first instanceof TossRuntimeError, first === second);
`,
  );

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(output(result), "once\ntrue true\n");
});

Deno.test("loads a diamond dependency once", async () => {
  const result = await runModuleProgram({
    "main.toss": "%import('./left.toss') print. %import('./right.toss') print.",
    "left.toss": "%export(%import('./shared.toss')).",
    "right.toss": "%export(%import('./shared.toss')).",
    "shared.toss": "'shared' print. %export(7).",
  }, "main.toss");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(output(result), "shared\n7\n7\n");
});

Deno.test("accepts local filenames containing URL punctuation", async () => {
  const result = await runModuleProgram({
    "main.toss": "%import('./lib#part?.toss') print.",
    "lib#part?.toss": "%export(7).",
  }, "main.toss");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(output(result), "7\n");
});

for (
  const path of [
    "/absolute.toss",
    "https://example.test/a.toss",
    "pkg.toss",
    "./missing-extension",
  ]
) {
  Deno.test(`rejects unsupported module path in a real bundle: ${path}`, async () => {
    await assert.rejects(() =>
      runModuleProgram({
        "main.toss": `%import('${path}').`,
      }, "main.toss"), /%import path must be relative and end in \.toss/);
  });
}
