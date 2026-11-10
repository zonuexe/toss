// Isolated synchronous generator experiment; this is not the Toss runtime.
import assert from "node:assert/strict";

function* handle(computation, cases) {
  const iterator = computation();
  let finished = false;

  function* drive(step) {
    while (!step.done) {
      const request = step.value;
      if (!cases.has(request.effect)) {
        step = iterator.next(yield request);
        continue;
      }
      let used = false;
      let active = true;
      let suspended = false;
      function* resume(value) {
        if (!active || suspended || used) throw new Error("invalid resume");
        used = true;
        return yield* drive(iterator.next(value));
      }
      const caseIterator = cases.get(request.effect)(request.payload, resume);
      const caseDelegate = {
        [Symbol.iterator]() {
          return this;
        },
        next(value) {
          suspended = false;
          const next = caseIterator.next(value);
          suspended = !next.done;
          return next;
        },
        throw(error) {
          suspended = false;
          const next = caseIterator.throw(error);
          suspended = !next.done;
          return next;
        },
        return(value) {
          suspended = false;
          const next = caseIterator.return(value);
          suspended = !next.done;
          return next;
        },
      };
      try {
        return yield* caseDelegate;
      } finally {
        active = false;
      }
    }
    finished = true;
    return step.value;
  }

  try {
    return yield* drive(iterator.next());
  } finally {
    if (!finished) {
      const step = iterator.return();
      if (!step.done) {
        throw new Error("cleanup cannot suspend in this experiment");
      }
    }
  }
}

function run(computation) {
  const iterator = computation();
  const step = iterator.next();
  if (!step.done) {
    iterator.return();
    throw new Error("unhandled effect");
  }
  return step.value;
}

const missing = Symbol("missing");
const logEffect = Symbol("log");
const trace = [];
const resumed = run(() =>
  handle(
    function* () {
      try {
        const value = yield { effect: missing, payload: "config" };
        trace.push("body-end");
        return value + 1;
      } finally {
        trace.push("cleanup");
      }
    },
    new Map([[missing, function* (payload, resume) {
      assert.equal(payload, "config");
      trace.push("handler-before");
      const value = yield* resume(10);
      trace.push("handler-after");
      return value * 2;
    }]]),
  )
);
assert.equal(resumed, 22);
assert.deepEqual(trace, [
  "handler-before",
  "body-end",
  "cleanup",
  "handler-after",
]);

const nestedTrace = [];
const nested = run(() =>
  handle(
    function* () {
      return yield* handle(
        function* () {
          try {
            yield { effect: missing, payload: null };
            nestedTrace.push("body-after");
            return 1;
          } finally {
            nestedTrace.push("body-cleanup");
          }
        },
        new Map([[missing, function* () {
          try {
            nestedTrace.push("inner-case");
            yield { effect: logEffect, payload: null };
            nestedTrace.push("case-after");
          } finally {
            nestedTrace.push("case-cleanup");
          }
        }]]),
      );
    },
    new Map([[logEffect, function* () {
      nestedTrace.push("outer-case");
      return 42;
    }]]),
  )
);
assert.equal(nested, 42);
assert.deepEqual(nestedTrace, [
  "inner-case",
  "outer-case",
  "case-cleanup",
  "body-cleanup",
]);

let saved;
assert.equal(
  run(() =>
    handle(
      function* () {
        return yield { effect: missing, payload: null };
      },
      new Map([[missing, function* (_payload, resume) {
        saved = resume;
        return 42;
      }]]),
    )
  ),
  42,
);
assert.throws(() => saved(1).next(), /invalid resume/);

assert.throws(() =>
  run(() =>
    handle(
      function* () {
        return yield { effect: missing, payload: null };
      },
      new Map([[missing, function* (_payload, resume) {
        yield* resume(1);
        yield* resume(2);
      }]]),
    )
  ), /invalid resume/);

// An outer case must not invoke the resume of an inner suspended case.
const suspendEffect = Symbol("suspend");
assert.throws(
  () =>
    run(() =>
      handle(
        function* () {
          return yield* handle(
            function* () {
              return yield { effect: missing, payload: null };
            },
            new Map([[missing, function* (_payload, resume) {
              return yield { effect: suspendEffect, payload: resume };
            }]]),
          );
        },
        new Map([[suspendEffect, function* (innerResume) {
          return yield* innerResume(9);
        }]]),
      )
    ),
  /invalid resume/,
);

// Once the outer case resumes the inner case, its original resume is usable.
assert.equal(
  run(() =>
    handle(
      function* () {
        return yield* handle(
          function* () {
            return yield { effect: missing, payload: null };
          },
          new Map([[missing, function* (_payload, resume) {
            const value = yield { effect: suspendEffect, payload: null };
            return yield* resume(value);
          }]]),
        );
      },
      new Map([[suspendEffect, function* (_payload, resume) {
        return yield* resume(9);
      }]]),
    )
  ),
  9,
);

// Case selection is live per request, while the selected case keeps running.
const mutationTrace = [];
const mutableCases = new Map([[missing, function* (_payload, resume) {
  mutationTrace.push("old-start");
  yield { effect: suspendEffect, payload: null };
  mutationTrace.push("old-continue");
  return yield* resume(3);
}]]);
const mutationResult = run(() =>
  handle(
    function* () {
      return yield* handle(function* () {
        yield { effect: missing, payload: null };
        return yield { effect: missing, payload: null };
      }, mutableCases);
    },
    new Map([[suspendEffect, function* (_payload, resume) {
      mutableCases.set(missing, function* (_nextPayload, nextResume) {
        mutationTrace.push("new");
        return yield* nextResume(10);
      });
      return yield* resume(null);
    }]]),
  )
);
assert.equal(mutationResult, 10);
assert.deepEqual(mutationTrace, ["old-start", "old-continue", "new"]);

// An explicitly transformed analogue of the current map: Prelude snapshots its
// input and delegates to each transformed callback in sequence.
function* cooperativeMap(receiver, callback) {
  const values = receiver.slice();
  const result = [];
  for (const value of values) result.push(yield* callback(value));
  return result;
}

const mapTrace = [];
const mapped = run(() =>
  handle(
    function* () {
      return yield* cooperativeMap([1, 2], function* (value) {
        mapTrace.push(`before-${value}`);
        const increment = yield { effect: missing, payload: value };
        mapTrace.push(`after-${value}`);
        return value + increment;
      });
    },
    new Map([[missing, function* (payload, resume) {
      mapTrace.push(`handle-${payload}`);
      return yield* resume(10);
    }]]),
  )
);
assert.deepEqual(mapped, [11, 12]);
assert.deepEqual(mapTrace, [
  "before-1",
  "handle-1",
  "after-1",
  "before-2",
  "handle-2",
  "after-2",
]);

const mapAbandonment = [];
assert.equal(
  run(() =>
    handle(
      function* () {
        try {
          return yield* cooperativeMap([1, 2], function* (value) {
            mapAbandonment.push(`callback-${value}`);
            yield { effect: missing, payload: value };
            return value;
          });
        } finally {
          mapAbandonment.push("cleanup");
        }
      },
      new Map([[missing, function* () {
        return 42;
      }]]),
    )
  ),
  42,
);
assert.deepEqual(mapAbandonment, ["callback-1", "cleanup"]);

// A transformed dynamic send can preserve the actual receiver of an inherited
// method; it still needs runtime dispatch and parent-call integration in Toss.
function* cooperativeSend(receiver, key) {
  const method = Reflect.get(receiver, key);
  return yield* Reflect.apply(method, receiver, []);
}
const methodKey = Symbol("method");
const parent = {
  *[methodKey]() {
    const delta = yield { effect: missing, payload: this.base };
    return this.base + delta;
  },
};
const child = Object.assign(Object.create(parent), { base: 5 });
assert.equal(
  run(() =>
    handle(
      function* () {
        return yield* cooperativeSend(child, methodKey);
      },
      new Map([[missing, function* (payload, resume) {
        assert.equal(payload, 5);
        return yield* resume(7);
      }]]),
    )
  ),
  12,
);

console.log(
  "PASS: resumption, nested abandonment, cleanup, one-shot lifetime, cooperative map and inherited receiver",
);
