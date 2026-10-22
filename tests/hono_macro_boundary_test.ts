import assert from "node:assert/strict";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { runModuleProgram } from "./module_helpers.ts";
import { text } from "./helpers.ts";

async function library(): Promise<string> {
  return await Deno.readTextFile("lib/hono/macros.toss");
}

Deno.test("Hono macros launch async work and await the entire input once", async () => {
  const files = {
    "macros.toss": await library(),
    "main.toss": `
      %macroImport('./macros.toss').
      #state bind: ($Object clone |> %extend(count: 0)).
      #value bind: 99.
      %runAsync({
        #value bind: 42.
        #pending bind: {
          $state at: 'count' put: (($state count) add: 1).
          %js(value = $value; Promise.resolve(value))
        }.
        #result bind: %request($pending value).
        $result print.
        $state count print
      }).`,
  };

  const result = await runModuleProgram(files, "main.toss");

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "42\n1\n");
});

Deno.test("Hono async launch propagates a rejected request to process failure", async () => {
  const files = {
    "macros.toss": await library(),
    "main.toss": `
      %macroImport('./macros.toss').
      %runAsync({
        %request(%js(Promise.reject(new Error('macro request rejected')))).
        'unexpected success' print
      }).`,
  };

  const result = await runModuleProgram(files, "main.toss");

  assert.notEqual(result.code, 0);
  assert.match(text(result.stderr), /macro request rejected/);
  assert.equal(text(result.stdout), "");
});

Deno.test("Hono request macro still requires an enclosing async Block", async () => {
  const files = {
    "macros.toss": await library(),
    "main.toss": "%macroImport('./macros.toss'). %request(1).",
  };

  await assert.rejects(
    () => runModuleProgram(files, "main.toss"),
    (error: unknown) =>
      error instanceof TossSyntaxError && /async Block/.test(error.message),
  );
});
