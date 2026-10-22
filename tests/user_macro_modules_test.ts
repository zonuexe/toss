import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";
import { runModuleProgram } from "./module_helpers.ts";

for (
  const [name, files, expected] of [
    [
      "macro definitions are private to each file",
      {
        "main.toss":
          "%macro(#n, { s -> %quote(9) }). %n() print. %import('./lib.toss') print.",
        "lib.toss": "%macro(#n, { s -> %quote(7) }). %export(%n()).",
      },
      "9\n7\n",
    ],
    [
      "generated imports join the static graph and share initialization",
      {
        "main.toss":
          "%macro(#load, { s -> %quote(%import('./value.toss')) }). %load() print. %load() print.",
        "value.toss": "'init' print. %export(7).",
      },
      "init\n7\n7\n",
    ],
    [
      "unused quoted imports are only compile-time data",
      {
        "main.toss":
          "%macro(#unused, { s -> %quote(%import('./missing.toss')) }). 7 print.",
      },
      "7\n",
    ],
    [
      "exported Blocks keep macro definition root and caller parameters",
      {
        "main.toss":
          "#offset bind: 100. #f bind: %import('./lib.toss'). ($f value: 1) print.",
        "lib.toss":
          "#offset bind: 10. %macro(#bump, { s -> %`((%,($s)) add: $offset) }). %export({ offset -> %bump($offset) }).",
      },
      "11\n",
    ],
  ] as const
) {
  Deno.test(`user macro module: ${name}`, async () => {
    const result = await runModuleProgram(files, "main.toss");
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), expected);
  });
}

Deno.test("spliced runtime failures retain argument location and expansion trace", async () => {
  const result = await execute(
    "%macro(#id, { s -> $s }).\n\n%id($missing).",
  );
  assert.notEqual(result.code, 0);
  assert.match(text(result.stderr), /fixture\.toss:3:5:/);
  assert.match(text(result.stderr), /id/);
});

Deno.test("introduced runtime failures include template and invocation provenance", async () => {
  const result = await execute(
    "%macro(#broken, { s -> %quote($missing) }).\n\n%broken().",
  );
  assert.notEqual(result.code, 0);
  assert.match(text(result.stderr), /fixture\.toss:1:/);
  assert.match(text(result.stderr), /fixture\.toss:3:/);
  assert.match(text(result.stderr), /broken/);
});
