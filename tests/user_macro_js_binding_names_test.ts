import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";

for (const name of ["$", "$$value", "value$", "some$value", "$1"]) {
  for (const macro of [false, true]) {
    Deno.test(`JS binding ${name} remains valid with macro input ${macro}`, async () => {
      const definition = macro ? "%macro(#id, { s -> $s }). " : "";
      const value = macro ? "%id(7)" : "7";
      const result = await execute(
        `${definition}%js(${name} = ${value}; ${name}) print.`,
      );
      assert.equal(result.code, 0, text(result.stderr));
      assert.equal(text(result.stdout), "7\n");
    });
  }
}

for (const source of ["%js(x = 1,; x).", "%js(, x = 1; x)."]) {
  Deno.test(`empty JS bindings retain the original source file: ${source}`, () => {
    assert.throws(
      () => compile(source, "binding.toss"),
      (error: unknown) =>
        error instanceof TossSyntaxError &&
        error.location.file === "binding.toss",
    );
  });
}
