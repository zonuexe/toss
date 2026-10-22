import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";
import { output, runModuleProgram } from "./module_helpers.ts";

const cases = [
  [
    "ordinary values await without changing identity",
    "#array bind: [1]. #block bind: %async({ $array }). #callback bind: $block asJSCallback. %js(array = $array, callback = $callback; callback().then(result => console.log(array === result))).",
    "true\n",
  ],
  [
    "plain Toss Objects do not have their then slot read",
    "#object bind: ($Object clone |> %extend(then: %js(() => { throw new Error('assimilated'); }))). #block bind: %async({ $object }). #callback bind: $block asJSCallback. %js(object = $object, callback = $callback; callback().then(result => console.log(result === object))).",
    "true\n",
  ],
  [
    "native Promise results use JavaScript conversion",
    "#promise bind: %js(Promise.resolve([1, 2])). #block bind: %async({ %await($promise) }). #callback bind: $block asJSCallback. %js(callback = $callback; callback().then(value => console.log(Array.isArray(value) && value.length === 2))).",
    "true\n",
  ],
  [
    "native thenables use normal JavaScript await semantics",
    "#thenable bind: %js({ then(resolve) { resolve(14); } }). #block bind: %async({ %await($thenable) }). #callback bind: $block asJSCallback. %js(callback = $callback; callback().then(value => console.log(value))).",
    "14\n",
  ],
  [
    "nested async results are not implicitly flattened",
    "#inner bind: %async({ 9 }). #outer bind: %async({ $inner value }). #runner bind: %async({ #nested bind: %await($outer value). %await($nested) }). #callback bind: $runner asJSCallback. %js(callback = $callback; callback().then(value => console.log(value))).",
    "9\n",
  ],
  [
    "async callback result converts to a native Promise and original Response",
    "#block bind: %async({ %await(%js(Promise.resolve(new Response('ok')))) }). #callback bind: $block asJSCallback. %js(callback = $callback; callback().then(value => console.log(value instanceof Response))).",
    "true\n",
  ],
] as const;

for (const [name, source, expected] of cases) {
  Deno.test(`Async values: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), expected);
  });
}

Deno.test("bundled Toss module exports an async Block without awaiting initialization", async () => {
  const result = await runModuleProgram({
    "main.toss":
      "#handler bind: %import('./handler.toss'). #callback bind: $handler asJSCallback. %js(callback = $callback; callback().then(value => console.log(value))).",
    "handler.toss":
      "%export(%async({ %await(%js(Promise.resolve('ready'))) })).",
  }, "main.toss");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(output(result), "ready\n");
});

Deno.test("module initializer rejects await outside an async Block", async () => {
  await assert.rejects(() =>
    runModuleProgram({
      "main.toss": "%export(%await(%js(Promise.resolve(1)))).",
    }, "main.toss"), /%await is only valid directly inside an async Block/);
});
