import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { execute, executeJavaScript, text } from "./helpers.ts";

Deno.test("too few host arguments fail at the adapter conversion site", async () => {
  const result = await execute(
    "#callback bind: { one -> $one } asJSCallback.\n%js(callback = $callback; callback()).",
  );
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /fixture\.toss:1:\d+: RuntimeError: JavaScript callback expects 1 argument\(s\), received 0\./,
  );
});

Deno.test("selected unsupported host values fail at the conversion site", async () => {
  const result = await execute(
    "#callback bind: { one -> $one } asJSCallback.\n%js(callback = $callback; callback(1n)).",
  );
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /fixture\.toss:1:\d+: RuntimeError: Unsupported JavaScript result type bigint\./,
  );
});

Deno.test("a directly returned Toss Block is rejected at the conversion site", async () => {
  const result = await execute(
    "#callback bind: { { 1 } } asJSCallback.\n%js(callback = $callback; callback()).",
  );
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /fixture\.toss:1:\d+: RuntimeError: Toss Blocks cannot be passed directly to JavaScript\./,
  );
});

Deno.test("Toss body errors keep their original source location", async () => {
  const result = await execute(
    "#callback bind: { one ->\n  $missing\n} asJSCallback.\n%js(callback = $callback; callback(1)).",
  );
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /fixture\.toss:2:3: RuntimeError: Unbound name "missing"\./,
  );
});

Deno.test("a surrounding JavaScript expression keeps the Toss error as cause", async () => {
  const javascript = compile(
    "#callback bind: { $missing } asJSCallback.",
    "cause.toss",
  );
  const result = await executeJavaScript(
    javascript + `
const callback = fetchBinding("callback", {location: {file: "host", line: 1, column: 1}, environment});
try {
  evaluateJavaScript("callback()", [callback], {location: {file: "host", line: 2, column: 1}, environment}, ["callback"]);
  console.log("did not throw");
} catch (error) {
  console.log(error instanceof TossRuntimeError, error.cause instanceof TossRuntimeError, error.cause.message.includes('Unbound name "missing"'));
}
`,
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true true true\n");
});
