import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { execute, text } from "./helpers.ts";

for (
  const source of [
    "%await(1).",
    "{ %await(1) }.",
    "%async({ { %await(1) } }).",
    "%await().",
    "%await(1, 2).",
    "%async(1).",
    "%async({ 1 },).",
    "%async ({ 1 }).",
    "%macro(#async, { syntax -> $syntax }).",
    "%macro(#await, { syntax -> $syntax }).",
    "%macro(#bad, { syntax -> %await(1) }). %bad(1).",
  ]
) {
  Deno.test(`Async syntax rejects invalid form ${source}`, () => {
    assert.throws(() => compile(source, "async-syntax.toss"));
  });
}

Deno.test("await in a nested async Block resets the enclosing boundary", async () => {
  const result = await execute(
    "#block bind: %async({ %async({ %await(8) }) }). #runner bind: %async({ #nested bind: %await($block value). %await($nested value) }). #callback bind: $runner asJSCallback. %js(callback = $callback; callback().then(value => console.log(value))).",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "8\n");
});

Deno.test("macro generated await is checked after insertion", async () => {
  const result = await execute(
    "%macro(#waitFor, { syntax -> %`(%await(%,($syntax))) }). #block bind: %async({ %await(%waitFor(12)) }). #callback bind: $block asJSCallback. %js(callback = $callback; callback().then(value => console.log(value))).",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "12\n");
});

Deno.test("macro generated async Blocks remain runtime syntax", async () => {
  const result = await execute(
    "%macro(#makeAsync, { syntax -> %`(%async({ %,($syntax) })) }). #block bind: %makeAsync(13). #callback bind: $block asJSCallback. %js(callback = $callback; callback().then(value => console.log(value))).",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "13\n");
});
