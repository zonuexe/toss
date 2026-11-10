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

// A fresh per-failure envelope avoids sharing metadata when the same thrown
// value is reused and permits primitive JS thrown values. It changes the
// internal thrown object, so host-boundary behavior needs separate design.
class Failure {
  constructor(primary) {
    this.primary = primary;
    this.cleanup = [];
  }
}
function* ensureEnvelope(body, cleanup) {
  let failure;
  try {
    return yield* body();
  } catch (error) {
    failure = error instanceof Failure ? error : new Failure(error);
    throw failure;
  } finally {
    try {
      cleanup();
    } catch (error) {
      const cleanupFailure = error instanceof Failure
        ? error
        : new Failure(error);
      if (failure === undefined) throw cleanupFailure;
      failure.cleanup.push(cleanupFailure);
    }
  }
}
function failedOutcome(iterator) {
  try {
    iterator.next();
  } catch (error) {
    assert.ok(error instanceof Failure);
    return error;
  }
  throw new Error("expected failure");
}
const sharedError = new Error("reused");
const firstCleanup = new Error("first cleanup");
const first = failedOutcome(ensureEnvelope(
  function* () {
    throw sharedError;
  },
  () => {
    throw firstCleanup;
  },
));
const second = failedOutcome(ensureEnvelope(
  function* () {
    throw sharedError;
  },
  () => {},
));
assert.equal(first.primary, sharedError);
assert.equal(second.primary, sharedError);
assert.notEqual(first, second);
assert.deepEqual(first.cleanup.map((error) => error.primary), [firstCleanup]);
assert.deepEqual(second.cleanup, []);
const primitive = failedOutcome(ensureEnvelope(
  function* () {
    throw undefined;
  },
  () => {
    throw 7;
  },
));
assert.equal(primitive.primary, undefined);
assert.equal(primitive.cleanup[0].primary, 7);
console.log(
  "PASS: per-failure envelopes isolate reused errors and retain primitive throws",
);
