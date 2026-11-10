// Standalone generator experiment: explicit cleanup error bookkeeping.
import assert from "node:assert/strict";

function* naive(body, cleanup) {
  try {
    return yield* body();
  } finally {
    cleanup();
  }
}
const bodyFailure = new Error("body");
const cleanupFailure = new Error("cleanup");
const broken = naive(function* () {
  throw bodyFailure;
}, () => {
  throw cleanupFailure;
});
assert.throws(() => broken.next(), (error) => error === cleanupFailure);

// Error objects only: this is not a general Toss error representation.
const associated = new WeakMap();
function retain(primary, secondary) {
  const errors = associated.get(primary) ?? [];
  errors.push(secondary);
  associated.set(primary, errors);
}
function* ensure(body, cleanup) {
  let failed = false;
  let primary;
  try {
    return yield* body();
  } catch (error) {
    failed = true;
    primary = error;
    throw error;
  } finally {
    try {
      cleanup();
    } catch (error) {
      if (!failed) throw error;
      retain(primary, error);
    }
  }
}
const innerFailure = new Error("inner cleanup");
const outerFailure = new Error("outer cleanup");
const order = [];
const failed = ensure(
  () =>
    ensure(function* () {
      throw bodyFailure;
    }, () => {
      order.push("inner");
      throw innerFailure;
    }),
  () => {
    order.push("outer");
    throw outerFailure;
  },
);
assert.throws(() => failed.next(), (error) => error === bodyFailure);
assert.deepEqual(order, ["inner", "outer"]);
assert.deepEqual(associated.get(bodyFailure), [innerFailure, outerFailure]);

const abandonedInner = new Error("abandoned inner");
const abandonedOuter = new Error("abandoned outer");
const abandoned = ensure(
  () =>
    ensure(function* () {
      yield "request";
    }, () => {
      throw abandonedInner;
    }),
  () => {
    throw abandonedOuter;
  },
);
assert.deepEqual(abandoned.next(), { value: "request", done: false });
assert.throws(() => abandoned.return(), (error) => error === abandonedInner);
assert.deepEqual(associated.get(abandonedInner), [abandonedOuter]);
console.log(
  "PASS: naive finally masks errors; explicit bookkeeping preserves primary and cleanup order",
);
