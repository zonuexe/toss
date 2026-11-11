// Isolated dynamic lookup model: no continuation or Toss runtime integration.
import assert from "node:assert/strict";
const effect = Symbol("effect");
let handlers = [];
function handle(cases, body) {
  const previous = handlers;
  handlers = [...previous, cases];
  try {
    return body();
  } finally {
    handlers = previous;
  }
}
function raise(key) {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i].has(key)) return handlers[i].get(key)();
  }
  throw new Error("unhandled at boundary");
}
function boundary(body) {
  const previous = handlers;
  handlers = [];
  try {
    return body();
  } finally {
    handlers = previous;
  }
}
const outer = new Map([[effect, () => "outer"]]);
const inner = new Map([[effect, () => "inner"]]);
handle(outer, () => {
  assert.equal(raise(effect), "outer");
  assert.throws(() => boundary(() => raise(effect)), /unhandled at boundary/);
  assert.equal(boundary(() => handle(inner, () => raise(effect))), "inner");
  assert.equal(raise(effect), "outer");
});
const pending = handle(outer, () =>
  boundary(async () => {
    assert.throws(() => raise(effect), /unhandled at boundary/);
    await Promise.resolve();
    assert.throws(() => raise(effect), /unhandled at boundary/);
    assert.equal(handle(inner, () => raise(effect)), "inner");
  }));
await pending;
console.log(
  "PASS: explicit boundaries isolate outer handlers before and after await",
);
