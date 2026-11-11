// Isolated cooperative module-state model, not Toss-generated module code.
import assert from "node:assert/strict";

const states = new Map();
const initializers = new Map();
function initialize(id) {
  let abandoning = false;
  const iterator = (function* () {
    const previous = states.get(id);
    if (previous?.state === "done") return previous.value;
    if (previous?.state === "failed") throw previous.error;
    if (previous?.state === "running") {
      throw new Error("module initialization re-entered");
    }
    states.set(id, { state: "running" });
    try {
      const value = yield* initializers.get(id)();
      states.set(id, { state: "done", value });
      return value;
    } catch (error) {
      if (abandoning) {
        const interruption = new Error("module initialization interrupted");
        interruption.cleanup = [error];
        states.set(id, { state: "failed", error: interruption });
      } else {
        states.set(id, { state: "failed", error });
      }
      throw error;
    } finally {
      if (states.get(id)?.state === "running") {
        states.set(id, {
          state: "failed",
          error: new Error("module initialization interrupted"),
        });
      }
    }
  })();
  return {
    [Symbol.iterator]() {
      return this;
    },
    next(value) {
      return iterator.next(value);
    },
    throw(error) {
      return iterator.throw(error);
    },
    return(value) {
      abandoning = true;
      return iterator.return(value);
    },
  };
}

let starts = 0;
initializers.set("resumed", function* () {
  starts++;
  return yield "request";
});
const suspended = initialize("resumed");
assert.deepEqual(suspended.next(), { value: "request", done: false });
assert.throws(() => initialize("resumed").next(), /re-entered/);
assert.deepEqual(suspended.next(7), { value: 7, done: true });
assert.deepEqual(initialize("resumed").next(), { value: 7, done: true });
assert.equal(starts, 1);

let cleanups = 0;
initializers.set("abandoned", function* () {
  try {
    yield "request";
  } finally {
    cleanups++;
  }
});
const abandoned = initialize("abandoned");
abandoned.next();
abandoned.return();
assert.throws(() => initialize("abandoned").next(), /interrupted/);
assert.equal(cleanups, 1);

const failure = new Error("original failure");
initializers.set("failed", function* () {
  throw failure;
});
assert.throws(() => initialize("failed").next(), (error) => error === failure);
assert.throws(() => initialize("failed").next(), (error) => error === failure);
console.log(
  "PASS: module suspension, re-entry, completion, abandonment and failure caching",
);

const cleanupFailure = new Error("cleanup failed");
initializers.set("abandoned-failure", function* () {
  try {
    yield "request";
  } finally {
    throw cleanupFailure;
  }
});
const abandonedFailure = initialize("abandoned-failure");
abandonedFailure.next();
assert.throws(
  () => abandonedFailure.return(),
  (error) => error === cleanupFailure,
);
assert.throws(() => initialize("abandoned-failure").next(), (error) => {
  return error.message === "module initialization interrupted" &&
    error.cleanup?.[0] === cleanupFailure;
});
console.log(
  "PASS: module abandonment preserves cleanup failure and caches interruption",
);

const nestedCleanup = new Error("nested cleanup failed");
initializers.set("nested-abandonment", function* () {
  try {
    yield "request";
  } finally {
    throw nestedCleanup;
  }
});
function* importingCaller() {
  return yield* initialize("nested-abandonment");
}
const caller = importingCaller();
caller.next();
assert.throws(() => caller.return(), (error) => error === nestedCleanup);
assert.throws(() => initialize("nested-abandonment").next(), (error) => {
  return error.message === "module initialization interrupted" &&
    error.cleanup?.[0] === nestedCleanup;
});
console.log("PASS: delegated abandonment preserves module interruption state");
