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
      function* resume(value) {
        if (!active || used) throw new Error("invalid resume");
        used = true;
        return yield* drive(iterator.next(value));
      }
      try {
        return yield* cases.get(request.effect)(request.payload, resume);
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
