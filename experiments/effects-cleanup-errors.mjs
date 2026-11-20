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
const failures = new WeakSet();
class Failure {
  constructor(primary) {
    failures.add(this);
    this.primary = primary;
    this.cleanup = [];
  }
}
function asFailure(value) {
  if (
    ((typeof value === "object" && value !== null) ||
      typeof value === "function") && failures.has(value)
  ) return value;
  return new Failure(value);
}
function* ensureEnvelope(body, cleanup) {
  let failure;
  try {
    return yield* body();
  } catch (error) {
    failure = asFailure(error);
    throw failure;
  } finally {
    try {
      cleanup();
    } catch (error) {
      const cleanupFailure = asFailure(error);
      if (failure === undefined) throw cleanupFailure;
      failure.cleanup.push(cleanupFailure);
    }
  }
}
function failedOutcome(iterator) {
  try {
    while (true) {
      const step = iterator.next();
      if (step.done) break;
      assert.equal(step.value, "suspend");
    }
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

// Model cache templates and host-boundary unwrapping independently of the Toss
// compiler. A cached failure is copied per import, while its primary value and
// associated Error objects keep their original identity.
function copyFailure(failure) {
  const copy = new Failure(failure.primary);
  copy.cleanup = failure.cleanup.map(copyFailure);
  return copy;
}
function captureFailure(failure) {
  return Object.freeze({
    primary: failure.primary,
    cleanup: Object.freeze(failure.cleanup.map(captureFailure)),
  });
}
function exposeFailure(failure, observe) {
  observe(captureFailure(failure));
  throw failure.primary;
}

const cachedPrimary = new Error("cached module error");
const moduleCleanup = new Error("module cleanup");
const callerCleanup = new Error("caller cleanup");
let cachedTemplate;
let initializationCount = 0;
function importFailedModule() {
  if (cachedTemplate !== undefined) throw copyFailure(cachedTemplate);
  initializationCount++;
  const failure = failedOutcome(ensureEnvelope(function* () {
    yield "suspend";
    throw cachedPrimary;
  }, () => {
    throw moduleCleanup;
  }));
  cachedTemplate = copyFailure(failure);
  throw failure;
}
const firstImport = failedOutcome(ensureEnvelope(function* () {
  yield "suspend";
  importFailedModule();
}, () => {
  throw callerCleanup;
}));
const secondImport = failedOutcome(ensureEnvelope(function* () {
  yield "suspend";
  importFailedModule();
}, () => {}));
assert.equal(initializationCount, 1);
assert.notEqual(firstImport, secondImport);
assert.equal(firstImport.primary, cachedPrimary);
assert.equal(secondImport.primary, cachedPrimary);
assert.deepEqual(firstImport.cleanup.map((entry) => entry.primary), [
  moduleCleanup,
  callerCleanup,
]);
assert.deepEqual(secondImport.cleanup.map((entry) => entry.primary), [
  moduleCleanup,
]);
let hostDetails;
assert.throws(() =>
  exposeFailure(firstImport, (details) => {
    hostDetails = details;
  }), (error) => error === cachedPrimary);
assert.equal(hostDetails.primary, cachedPrimary);
assert.deepEqual(hostDetails.cleanup.map((entry) => entry.primary), [
  moduleCleanup,
  callerCleanup,
]);
assert.ok(Object.isFrozen(hostDetails.cleanup));
firstImport.cleanup[0].cleanup.push(
  new Failure(new Error("later nested cleanup")),
);
assert.equal(hostDetails.cleanup[0].cleanup.length, 0);
assert.equal(secondImport.cleanup[0].cleanup.length, 0);

const nestedCleanup = new Error("nested cleanup");
const outerCleanup = new Error("outer cleanup");
let nestedDetails;
const outerOccurrence = failedOutcome(ensureEnvelope(function* () {
  yield "suspend";
  throw cachedPrimary;
}, () => {
  const nested = failedOutcome(ensureEnvelope(function* () {
    yield "suspend";
    throw cachedPrimary;
  }, () => {
    throw nestedCleanup;
  }));
  assert.throws(() =>
    exposeFailure(nested, (details) => {
      nestedDetails = details;
    }), (error) => error === cachedPrimary);
  throw outerCleanup;
}));
assert.deepEqual(nestedDetails.cleanup.map((entry) => entry.primary), [
  nestedCleanup,
]);
assert.deepEqual(outerOccurrence.cleanup.map((entry) => entry.primary), [
  outerCleanup,
]);

let release;
const gate = new Promise((resolve) => {
  release = resolve;
});
async function concurrentOccurrence(cleanup) {
  try {
    await gate;
    throw cachedPrimary;
  } catch (error) {
    const failure = new Failure(error);
    failure.cleanup.push(new Failure(cleanup));
    return failure;
  }
}
const concurrentA = concurrentOccurrence(firstCleanup);
const concurrentB = concurrentOccurrence(outerCleanup);
release();
const [asyncA, asyncB] = await Promise.all([concurrentA, concurrentB]);
assert.equal(asyncA.primary, cachedPrimary);
assert.equal(asyncB.primary, cachedPrimary);
assert.deepEqual(asyncA.cleanup.map((entry) => entry.primary), [firstCleanup]);
assert.deepEqual(asyncB.cleanup.map((entry) => entry.primary), [outerCleanup]);

let primitiveCaught = false;
try {
  exposeFailure(new Failure(undefined), () => {});
} catch (error) {
  primitiveCaught = true;
  assert.equal(error, undefined);
}
assert.equal(primitiveCaught, true);
let proxyReads = 0;
const hostile = new Proxy({}, {
  get() {
    proxyReads++;
    throw new Error("unexpected property access");
  },
  getPrototypeOf() {
    proxyReads++;
    throw new Error("unexpected prototype access");
  },
});
const foreign = failedOutcome(ensureEnvelope(function* () {
  yield "suspend";
  throw hostile;
}, () => {}));
let foreignCaught = false;
try {
  exposeFailure(foreign, () => {});
} catch (error) {
  foreignCaught = true;
  assert.equal(error, hostile);
}
assert.equal(foreignCaught, true);
assert.equal(proxyReads, 0);
console.log(
  "PASS: per-occurrence model isolates cached, reentrant and async failures while host identity survives",
);
