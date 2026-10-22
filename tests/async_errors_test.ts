import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

Deno.test("async Block body failures reject with the original Toss location", async () => {
  const result = await execute(
    "#block bind: %async({ 1 divideBy: 0 }). #callback bind: $block asJSCallback. %js(callback = $callback; callback()).",
  );
  assert.notEqual(result.code, 0);
  assert.match(text(result.stderr), /RuntimeError: Division by zero\./);
  assert.match(text(result.stderr), /async-errors\.toss|fixture\.toss/);
});

Deno.test("native Promise rejection is wrapped at the await location with cause", async () => {
  const result = await execute(
    "#promise bind: %js(Promise.reject('original')). #block bind: %async({ %await($promise) }). #callback bind: $block asJSCallback. %js(callback = $callback; callback().catch(error => console.log(error.cause === 'original' && error.message.includes('JavaScript Promise rejected.')))).",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
});

Deno.test("wrong async Block arity fails synchronously at invocation", async () => {
  const result = await execute(
    "%async({ value -> $value }) value: 1 value: 2.",
  );
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /Block expects 1 argument\(s\), received 2\./,
  );
});
