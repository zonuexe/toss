import assert from "node:assert/strict";
import { runModuleProgram } from "./module_helpers.ts";
import { text } from "./helpers.ts";

Deno.test("shared macros instantiate runtime roots independently in each consumer", async () => {
  // Given two runtime modules using the same macro library.
  const files = {
    "main.toss": "%import('./a.toss') print. %import('./b.toss') print.",
    "shared.toss": "%macro(#offsetValue, { s -> %`((%,($s)) add: $offset) }).",
    "a.toss":
      "%macroImport('./shared.toss'). #offset bind: 10. %export(%offsetValue(1)).",
    "b.toss":
      "%macroImport('./shared.toss'). #offset bind: 20. %export(%offsetValue(1)).",
  };
  // When both consumers initialize.
  const result = await runModuleProgram(files, "main.toss");
  // Then each expansion uses its own consumer root.
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "11\n21\n");
});

Deno.test("shared macro splices retain caller scope and evaluate once", async () => {
  // Given a macro that introduces the same name as a caller binding.
  const files = {
    "main.toss":
      "%macroImport('./shared.toss'). #app bind: 40. #state bind: ($Object clone |> %extend(count: 0)). #read bind: { $state at: 'count' put: (($state count) add: 1). $app }. %local($read value) print. $state count print.",
    "shared.toss":
      "%macro(#local, { s -> %`({ #app bind: 2. (%,($s)) add: $app } value) }).",
  };
  // When a side-effecting multi-token expression is spliced.
  const result = await runModuleProgram(files, "main.toss");
  // Then the introduced name is hygienic and input runs once.
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "42\n1\n");
});

Deno.test("shared templates resolve earlier library helpers", async () => {
  // Given an earlier helper in a macro-only file.
  const files = {
    "main.toss": "%macroImport('./shared.toss'). %plusBase(3) print.",
    "shared.toss":
      "%macro(#base, { s -> %quote(7) }). %macro(#plusBase, { s -> %`(%base() add: (%,($s))) }).",
  };
  // When an imported macro expands another library macro.
  const result = await runModuleProgram(files, "main.toss");
  // Then the helper remains available in its template context.
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "10\n");
});

Deno.test("shared templates cannot see later library helpers", async () => {
  // Given a template referring forward to a later declaration.
  const files = {
    "main.toss": "%macroImport('./shared.toss'). %first() print.",
    "shared.toss":
      "%macro(#first, { s -> %quote(%later()) }). %macro(#later, { s -> %quote(7) }).",
  };
  // When the template is expanded, then source-order lookup rejects it.
  await assert.rejects(
    () => runModuleProgram(files, "main.toss"),
    /Macro %later is not defined at this source position/,
  );
});

Deno.test("unused quoted macro imports remain inert", async () => {
  // Given a never-expanded macro containing an import as quoted syntax.
  const files = {
    "main.toss":
      "%macro(#unused, { s -> %quote(%macroImport('./missing.toss')) }). 7 print.",
  };
  // When the file compiles and runs, then no dependency is loaded.
  const result = await runModuleProgram(files, "main.toss");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "7\n");
});

Deno.test("macro library runtime imports retain consumer-relative paths", async () => {
  // Given different values next to a library and its consumer.
  const files = {
    "main.toss": "%import('./consumer/app.toss') print.",
    "macros.toss": "%macro(#load, { s -> %quote(%import('./value.toss')) }).",
    "value.toss": "%export(1).",
    "consumer/value.toss": "%export(9).",
    "consumer/app.toss": "%macroImport('../macros.toss'). %export(%load()).",
  };
  // When the generated import runs, then existing runtime resolution applies.
  const result = await runModuleProgram(files, "main.toss");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "9\n");
});

Deno.test("unused quoted macro imports inside libraries stay inert", async () => {
  // Given a library definition holding an unused directive as syntax data.
  const files = {
    "main.toss": "%macroImport('./shared.toss'). 7 print.",
    "shared.toss":
      "%macro(#unused, { s -> %quote(%macroImport('./missing.toss')) }). %macro(#unusedQuasi, { s -> %`(%macroImport('./missing.toss')) }).",
  };
  // When the library loads, then the quoted dependency is not inspected.
  const result = await runModuleProgram(files, "main.toss");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "7\n");
});

Deno.test("macro libraries reject empty statements", async () => {
  // Given a stray period instead of a macro declaration.
  const files = {
    "main.toss": "%macroImport('./shared.toss'). 7 print.",
    "shared.toss": ".",
  };
  // When the library loads, then invalid syntax is rejected.
  await assert.rejects(() => runModuleProgram(files, "main.toss"));
});
