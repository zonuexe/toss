import assert from "node:assert/strict";
import { compile, compileFile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, text } from "./helpers.ts";

Deno.test("local macro registry is source ordered and symbols stay ordinary", async () => {
  const source = "%macro(#id, { s -> $s }). #id dump. %id(7) print.";
  assert.equal(text((await execute(source)).stdout), "#id\n7\n");
  assert.throws(
    () =>
      compile("%later(). %macro(#later, { s -> %quote(1) }).", "order.toss"),
    TossSyntaxError,
  );
});

Deno.test("macro input stays opaque until the expander retains it", async () => {
  const source =
    "%macro(#seven, { s -> %quote(7) }). %seven(unknown: 1, 2) print.";
  assert.equal(text((await execute(source)).stdout), "7\n");
});

Deno.test("returned syntax recursively expands nested calls", async () => {
  const source = "%macro(#id, { s -> $s }). %id(%id(9)) print.";
  assert.equal(text((await execute(source)).stdout), "9\n");
});

Deno.test("JavaScript binding Toss syntax expands before parsing", async () => {
  const source = "%macro(#id, { s -> $s }). %js(value = %id(8); value) print.";
  assert.equal(text((await execute(source)).stdout), "8\n");
});

Deno.test("macro declarations are removed before runtime parsing", async () => {
  const output = await execute("%macro(#id, { s -> $s }). %id(4) print.");
  assert.equal(text(output.stdout), "4\n");
  for (
    const source of [
      "%macro(#id, { s -> $s }). %macro(#id, { s -> $s }).",
      "{ %macro(#id, { s -> $s }). }.",
      "%macro(#macro, { s -> $s }).",
      "%macro (#id, { s -> $s }).",
    ]
  ) {
    assert.throws(() => compile(source, "declaration.toss"), TossSyntaxError);
  }
});

Deno.test("generated imports enter module analysis", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-macro-import-" });
  await Deno.writeTextFile(`${directory}/dep.toss`, "%export(7).\n");
  await Deno.writeTextFile(
    `${directory}/main.toss`,
    "%macro(#load, { s -> %quote(%import('./dep.toss')) }). %export(%load()).\n",
  );
  const javascript = await compileFile(`${directory}/main.toss`);
  assert.match(javascript, /initializeModule/);
  await Deno.remove(directory, { recursive: true });
});

Deno.test("recursive expansion budget fails at the invocation", () => {
  assert.throws(
    () =>
      compile(
        "%macro(#loop, { s -> %quote(%loop()) }). %loop().",
        "budget.toss",
      ),
    (error: unknown) =>
      error instanceof TossSyntaxError &&
      error.location.file === "budget.toss" &&
      /loop|limit/i.test(error.message),
  );
});
