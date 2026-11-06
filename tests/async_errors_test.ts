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

for (
  const [name, rejection] of [
    [
      "a Proxy whose prototype lookup throws",
      "new Proxy({}, { getPrototypeOf() { throw 99; } })",
    ],
    [
      "a revoked Proxy",
      "(() => { const pair = Proxy.revocable({}, {}); pair.revoke(); return pair.proxy; })()",
    ],
  ] as const
) {
  Deno.test(`native Promise rejection preserves ${name} as cause`, async () => {
    const source = `%js(globalThis.rejection = ${rejection}).
#callback bind: %async({
  %await(%js(Promise.reject(globalThis.rejection)))
}) asJSCallback.
%js(callback = $callback; callback().catch(error => console.log(
  error.name === 'TossRuntimeError' && error.cause === globalThis.rejection &&
  error.message === 'fixture.toss:3:3: RuntimeError: JavaScript Promise rejected.'
))).`;

    const result = await execute(source);

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "true\n");
    assert.equal(text(result.stderr), "");
  });
}

Deno.test("cross-realm Promise rejection keeps its original Error as cause", async () => {
  const source = `#vm bind: %jsImport('node:vm').
#state bind: %js(vm = $vm; vm.runInNewContext('({ reason: new Error("foreign"), get promise() { return Promise.reject(this.reason); } })')).
#callback bind: %async({
  %await(%js(state = $state; state.promise))
}) asJSCallback.
%js(callback = $callback, state = $state; callback().catch(error => console.log(
  error.name === 'TossRuntimeError' && error.cause === state.reason &&
  error.message === 'fixture.toss:4:3: RuntimeError: JavaScript Promise rejected.'
))).`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
  assert.equal(text(result.stderr), "");
});

Deno.test("native Promise rejection wraps a Toss error after crossing the JS boundary", async () => {
  const source = `#failure bind: %async({ $missing }) asJSCallback.
#state bind: %js(failure = $failure; ({ promise: failure().catch(error => { globalThis.original = error; throw error; }) })).
#callback bind: %async({
  %await(%js(state = $state; state.promise))
}) asJSCallback.
%js(callback = $callback; callback().catch(error => console.log(
  error !== globalThis.original && error.cause === globalThis.original &&
  error.message === 'fixture.toss:4:3: RuntimeError: JavaScript Promise rejected.'
))).`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
  assert.equal(text(result.stderr), "");
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
