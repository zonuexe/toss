import assert from "node:assert/strict";
import {
  compile,
  compileSources,
  generateRuntimeModule,
} from "../src/compiler.ts";
import { executeModuleJavaScript, text } from "./helpers.ts";

const moduleUrl = (source: string): string =>
  `data:text/javascript;base64,${btoa(source)}`;
const runtimeImport = moduleUrl(generateRuntimeModule());
const failureObserverImport = moduleUrl(`
  export function onEffectFailure(report) {
    reports.push(report);
    events.push("diagnostic:" + report.boundary);
  }
  export function onLateHostOperationFailure(report) {
    lateReports.push(report);
    events.push("late");
    return Promise.reject(new Error("observer failure"));
  }
`);

Deno.test("a cancelled task first observed after rejection keeps its original diagnostic", async () => {
  const javascript = compile(
    `
%export({
  #task bind: (%async({
    $Effect onCancel: { %js(events.push("cleanup")). $cleanupFailure }.
    %await(%js(new Promise(() => {})))
  }) value).
  #cancel bind: { $task cancel: (%js(reason)) } asJSCallback.
  #read bind: { %js(p = $task; p) } asJSCallback.
  %js(cancel = $cancel, read = $read; ({cancel, read}))
} asJSCallback).
`,
    "unobserved-cancellation.toss",
    { format: "esm", failureObserverImport },
  );
  const result = await executeModuleJavaScript(
    javascript,
    `
    import assert from "node:assert/strict";
    Object.assign(globalThis, {events: [], reports: [], reason: new Error("stop")});
    const {cancel, read} = value();
    const dropped = new Promise(resolve => {
      addEventListener("unhandledrejection", event => {
        event.preventDefault();
        events.push("unhandled");
        resolve(event.reason);
      }, {once: true});
    });
    assert.equal(cancel(), true);
    const error = await dropped;
    assert.equal(error.cause, reason);
    assert.equal(error, reports[0].error);
    assert.match(reports[0].cleanupDescriptions[0], /cleanupFailure/);
    const exposed = read();
    assert.equal(read(), exposed);
    assert.equal(await exposed.catch(error => error), error);
    assert.deepEqual(events, ["cleanup", "diagnostic:unobserved-async", "unhandled"]);
    assert.equal(reports.length, 1);
  `,
  );
  assert.equal(result.success, true, text(result.stderr));
  assert.equal(text(result.stderr), "");
});

Deno.test("a child that fails before suspending still fails the owning task's join", async () => {
  const javascript = compile(
    `
%export(%async({
  $Effect spawn: %async({ $immediateChildFailure }).
  $Effect hostOperation: %js(signal => new Promise((_, reject) => {
    signal.addEventListener("abort", () => {
      globalThis.abortedWith = signal.reason;
      reject(signal.reason);
    }, {once: true});
  })).
  42
}) asJSCallback).
`,
    "immediate-child-failure.toss",
    { format: "esm", failureObserverImport },
  );
  const result = await executeModuleJavaScript(
    javascript,
    `
    import assert from "node:assert/strict";
    Object.assign(globalThis, {events: [], reports: []});
    const error = await value().catch(error => error);
    assert.match(error.message, /immediateChildFailure/);
    assert.equal(error, abortedWith);
    assert.equal(error, reports[0].error);
    assert.deepEqual(reports[0].cleanupDescriptions, []);
    assert.deepEqual(events, ["diagnostic:promise"]);
  `,
  );
  assert.equal(result.success, true, text(result.stderr));
  assert.equal(text(result.stderr), "");
});

for (
  const [kind, operand, cancel] of [
    [
      "host",
      "%js(gate.promise)",
      "gate.resolve(42); queueMicrotask(() => assert.equal(cancel(), true));",
    ],
    ["Toss", "%async({ 42 }) value", "assert.equal(cancel(), true);"],
  ]
) {
  Deno.test(`cancellation accepted before resuming a fulfilled ${kind} wait prevents the continuation`, async () => {
    const javascript = compile(
      `
  %export({
    #task bind: (%async({
      $Effect onCancel: { %js(events.push("cleanup")) }.
      %await(${operand}).
      %js(events.push("unexpected continuation"))
    }) value).
    #cancel bind: { $task cancel: (%js(reason)) } asJSCallback.
    %js(task = $task, cancel = $cancel; ({task, cancel}))
  } asJSCallback).
  `,
      "cancel-before-resume.toss",
      { format: "esm", failureObserverImport },
    );
    const result = await executeModuleJavaScript(
      javascript,
      `
      import assert from "node:assert/strict";
      Object.assign(globalThis, {events: [], reports: [], gate: Promise.withResolvers(), reason: new Error("stop")});
      const {task, cancel} = value();
      const rejection = task.catch(error => {
        events.push("catch");
        return error;
      });
      ${cancel}
      const error = await rejection;
      assert.equal(error.cause, reason);
      assert.equal(reports.length, 1);
      assert.equal(error, reports[0].error);
      assert.deepEqual(events, ["cleanup", "diagnostic:promise", "catch"]);
    `,
    );
    assert.equal(result.success, true, text(result.stderr));
    assert.equal(text(result.stderr), "");
  });
}

Deno.test("awaiting a rejected owned host Promise reports its failure only as the primary error", async () => {
  const javascript = compile(
    `
%export(%async({
  %await($Effect hostOperation: %js(_ => Promise.reject(reason)))
}) asJSCallback).
`,
    "await-owned-host-failure.toss",
    { format: "esm", failureObserverImport },
  );
  const result = await executeModuleJavaScript(
    javascript,
    `
    import assert from "node:assert/strict";
    Object.assign(globalThis, {events: [], reports: [], reason: new Error("host failure")});
    const error = await value().catch(error => error);
    assert.equal(error.cause, reason);
    assert.equal(reports.length, 1);
    assert.equal(error, reports[0].error);
    assert.deepEqual(reports[0].cleanupDescriptions, []);
  `,
  );
  assert.equal(result.success, true, text(result.stderr));
});

Deno.test("awaiting a task in failure cleanup remains cancellable", async () => {
  const javascript = compile(
    `
%export({
  #child bind: (%async({
    $Effect spawn: %async({
      $Effect onCancel: %async({
        %js(cleanupStarted.resolve(0)).
        %await(%js(cleanupGate.promise)).
        %js(events.push("cleanup finished")).
        $cleanupFailure
      }).
      %await(%js(new Promise(() => {})))
    }).
    $bodyFailure
  }) value).
  #waiting bind: (%async({ %await($child) }) value).
  #cancel bind: { $waiting cancel: (%js(reason)) } asJSCallback.
  %js(child = $child, waiting = $waiting, cancel = $cancel; ({child, waiting, cancel}))
} asJSCallback).
`,
    "await-during-failure-cleanup.toss",
    { format: "esm", failureObserverImport },
  );
  const result = await executeModuleJavaScript(
    javascript,
    `
    import assert from "node:assert/strict";
    Object.assign(globalThis, {
      events: [], reports: [], reason: new Error("stop waiting"),
      cleanupStarted: Promise.withResolvers(), cleanupGate: Promise.withResolvers(),
    });
    const {child, waiting, cancel} = value();
    const childFailure = child.catch(error => error);
    const waitingFailure = waiting.catch(error => error);
    await cleanupStarted.promise;
    assert.equal(cancel(), true);
    const stopped = await waitingFailure;
    assert.equal(stopped.cause, reason);
    assert.deepEqual(events, ["diagnostic:promise"]);
    assert.equal(reports[0].error, stopped);
    cleanupGate.resolve(0);
    const failed = await childFailure;
    assert.match(failed.message, /bodyFailure/);
    assert.equal(reports[1].error, failed);
    assert.match(reports[1].cleanupDescriptions[0], /cleanupFailure/);
    assert.deepEqual(events, ["diagnostic:promise", "cleanup finished", "diagnostic:promise"]);
    assert.equal(reports.length, 2);
  `,
  );
  assert.equal(result.success, true, text(result.stderr));
  assert.equal(text(result.stderr), "");
});

Deno.test("cancelling one pending Toss wait leaves other waiters and the producer running", async () => {
  const javascript = compile(
    `
%export({
  #producer bind: (%async({ %await(%js(producerGate.promise)) }) value).
  #first bind: (%async({
    $Effect onCancel: %async({
      %js((events.push("cleanup start"), cleanupStarted.resolve(), 0)).
      %await(%js(cleanupGate.promise)).
      %js(events.push("cleanup end")).
      $cleanupFailure
    }).
    %await($producer)
  }) value).
  #second bind: (%async({ %await($producer) }) value).
  #stop bind: { $first cancel: (%js(reason)) } asJSCallback.
  %js(first = $first, second = $second, stop = $stop; ({first, second, stop}))
} asJSCallback).
`,
    "shared-pending-toss-await.toss",
    { format: "esm", failureObserverImport },
  );
  const result = await executeModuleJavaScript(
    javascript,
    `
    import assert from "node:assert/strict";
    Object.assign(globalThis, {
      events: [], reports: [], reason: new Error("stop only the first waiter"),
      producerGate: Promise.withResolvers(), cleanupStarted: Promise.withResolvers(),
      cleanupGate: Promise.withResolvers(),
    });
    const {first, second, stop} = value();
    const failed = first.catch(error => { events.push("catch"); return error; });
    assert.equal(stop(), true);
    await cleanupStarted.promise;
    producerGate.resolve(42);
    assert.equal(await second, 42);
    assert.deepEqual(reports, []);
    cleanupGate.resolve();
    const error = await failed;
    assert.equal(error.cause, reason);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].error, error);
    assert.match(reports[0].cleanupDescriptions[0], /cleanupFailure/);
    assert.deepEqual(events, ["cleanup start", "cleanup end", "diagnostic:promise", "catch"]);
  `,
  );
  assert.equal(result.success, true, text(result.stderr));
  assert.equal(text(result.stderr), "");
});

for (const external of [false, true]) {
  const options = {
    format: "esm" as const,
    ...(external ? { runtimeImport } : { treeShakePrelude: true }),
  };
  Deno.test(`retained completed results keep Toss and JS identity (external=${external})`, async () => {
    const javascript = compile(
      `
%export({
  #payload bind: [42].
  #retained bind: (%async({
    %await(%js(gate.promise)).
    %js(done.resolve()).
    $payload
  }) value).
  #read bind: %async({ %await($retained) }) asJSCallback.
  #expose bind: { $retained } asJSCallback.
  #roundTrip bind: %async({ input -> (%await($input)) at: 0 }) asJSCallback.
  #stop bind: { $retained cancel: 'too late' } asJSCallback.
  %js(payload = $payload, read = $read, expose = $expose, roundTrip = $roundTrip, stop = $stop;
    ({payload, read, expose, roundTrip, stop}))
} asJSCallback).
`,
      "retained-completed-result.toss",
      { ...options, failureObserverImport },
    );
    const result = await executeModuleJavaScript(
      javascript,
      `
      import assert from "node:assert/strict";
      Object.assign(globalThis, {
        events: [], reports: [], gate: Promise.withResolvers(), done: Promise.withResolvers(),
      });
      const {payload, read, expose, roundTrip, stop} = value();
      const exposed = expose();
      assert.equal(expose(), exposed);
      const returnedWhilePending = roundTrip(exposed);
      gate.resolve();
      await done.promise;
      assert.equal(stop(), false);
      assert.equal(await read(), payload);
      assert.equal(expose(), exposed);
      assert.equal(await exposed, payload);
      assert.equal(await returnedWhilePending, 42);
      assert.equal(await roundTrip(exposed), 42);
      assert.equal(await read(), payload);
      assert.deepEqual(reports, []);
    `,
    );
    assert.equal(result.success, true, text(result.stderr));
    assert.equal(text(result.stderr), "");
  });

  Deno.test(`JS-only async promises still round trip and cancel their original tasks (external=${external})`, async () => {
    const javascript = compile(
      `
#start bind: %async({ %await(0). [41] }) asJSCallback.
#update bind: %async({ input ->
  #result bind: %await($input).
  $result at: 0 put: 42.
  $result
}) asJSCallback.
#pending bind: %async({
  #child bind: ($Effect spawn: %async({
    $Effect onCancel: %async({
      %js(cleanupStarted.resolve()).
      %await(%js(cleanupGate.promise)).
      %js(events.push("child cleanup")).
      $cleanupFailure
    }).
    %await(%js(new Promise(() => {})))
  })).
  %await($child)
}) asJSCallback.
#cancel bind: { input, reason -> $input cancel: $reason } asJSCallback.
#expose bind: { input -> $input } asJSCallback.
%export(%js(start = $start, update = $update, pending = $pending, cancel = $cancel, expose = $expose;
  ({start, update, pending, cancel, expose}))).
`,
      "javascript-only-async-result.toss",
      { ...options, failureObserverImport },
    );
    const result = await executeModuleJavaScript(
      javascript,
      `
      import assert from "node:assert/strict";
      Object.assign(globalThis, {
        events: [], reports: [], reason: new Error("cancel from JS"),
        cleanupStarted: Promise.withResolvers(), cleanupGate: Promise.withResolvers(),
      });
      const completed = value.start();
      const array = await completed;
      assert.equal(value.expose(completed), completed);
      assert.equal(await value.update(completed), array);
      assert.deepEqual(array, [42]);
      assert.equal(value.cancel(completed, reason), false);

      const pending = value.pending();
      const failed = pending.catch(error => { events.push("catch"); return error; });
      assert.equal(value.cancel(pending, reason), true);
      await cleanupStarted.promise;
      assert.deepEqual(reports, []);
      cleanupGate.resolve();
      const error = await failed;
      const reexposed = value.expose(pending);
      assert.equal(reexposed, pending);
      assert.equal(await reexposed.catch(error => error), error);
      assert.equal(error.cause, reason);
      assert.equal(reports[0].error, error);
      assert.match(reports[0].cleanupDescriptions[0], /cleanupFailure/);
      assert.deepEqual(events, ["child cleanup", "diagnostic:promise", "catch"]);
      assert.equal(reports.length, 1);
    `,
    );
    assert.equal(result.success, true, text(result.stderr));
    assert.equal(text(result.stderr), "");
  });

  Deno.test(`discarded async invocation reports its original failure after child cleanup (external=${external})`, async () => {
    const javascript = compile(
      `
%export({
  %async({ input ->
    $Effect spawn: %async({
      $Effect onCancel: %async({
        %js(cleanupStarted.resolve()).
        %await(%js(cleanupGate.promise)).
        %js(events.push("child cleanup")).
        $cleanupFailure
      }).
      %await(%js(new Promise(() => {})))
    }).
    %await($input)
  }) value: (%js(bodyGate.promise)).
  42
} asJSCallback).
`,
      "discarded-async-failure.toss",
      { ...options, failureObserverImport },
    );
    const result = await executeModuleJavaScript(
      javascript,
      `
      import assert from "node:assert/strict";
      Object.assign(globalThis, {
        events: [], reports: [], reason: new Error("original failure"),
        bodyGate: Promise.withResolvers(), cleanupStarted: Promise.withResolvers(),
        cleanupGate: Promise.withResolvers(),
      });
      const unhandled = new Promise(resolve => {
        addEventListener("unhandledrejection", event => {
          event.preventDefault();
          events.push("unhandled");
          resolve(event.reason);
        }, {once: true});
      });
      assert.equal(value(), 42);
      bodyGate.reject(reason);
      await cleanupStarted.promise;
      assert.deepEqual(reports, []);
      cleanupGate.resolve();
      const error = await unhandled;
      assert.equal(error.cause, reason);
      assert.equal(reports.length, 1);
      assert.equal(reports[0].error, error);
      assert.match(reports[0].cleanupDescriptions[0], /cleanupFailure/);
      assert.deepEqual(events, ["child cleanup", "diagnostic:unobserved-async", "unhandled"]);
    `,
    );
    assert.equal(result.success, true, text(result.stderr));
    assert.equal(text(result.stderr), "");
  });

  Deno.test(`ordinary AOT waits for cancelled child cleanup and reports late host failures (external=${external})`, async () => {
    const javascript = compileSources(
      "main.toss",
      new Map([
        [
          "main.toss",
          `
#startChild bind: %import('./child.toss').
#start bind: {
  #parent bind: (%async({
    $startChild value.
    %await(%js(bodyGate.promise)).
    %await(%js(Promise.reject(bodyReason)))
  }) value).
  #stop bind: { $parent cancel: (%js(cancelReason)) } asJSCallback.
  %js(parent = $parent, stop = $stop; ({parent, stop}))
}.
%export($start asJSCallback).
`,
        ],
        [
          "child.toss",
          `
%export({
  $Effect spawn: %async({
    $Effect onCancel: %async({
      %js((events.push("cleanup start"), cleanupStarted.resolve(), 0)).
      %await(%js(cleanupGate.promise)).
      %js(events.push("cleanup end")).
      $cleanupFailure
    }).
    $Effect hostOperation: %js(signal => {
      signal.addEventListener("abort", () => {
        globalThis.abortReason = signal.reason;
        events.push("abort");
      }, {once: true});
      return hostGate.promise;
    }) abortWaitMs: 0.
    %await(%js(new Promise(() => {})))
  })
}).
`,
        ],
      ]),
      { ...options, failureObserverImport },
    );
    const result = await executeModuleJavaScript(
      javascript,
      `
      import assert from "node:assert/strict";
      for (const cancel of [true, false]) {
        Object.assign(globalThis, {
          events: [], reports: [], lateReports: [],
          hostGate: Promise.withResolvers(), bodyGate: Promise.withResolvers(),
          cleanupGate: Promise.withResolvers(), cleanupStarted: Promise.withResolvers(),
          cancelReason: new Error("cancel reason"), bodyReason: new Error("body failure"),
        });
        const {parent, stop} = value();
        const rejected = parent.catch(error => {
          events.push("catch");
          return error;
        });
        if (cancel) {
          assert.equal(stop(), true);
          assert.equal(stop(), false);
        } else {
          bodyGate.resolve();
        }
        await cleanupStarted.promise;
        const rejection = Symbol("late rejection");
        hostGate.reject(rejection);
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.deepEqual(events, ["abort", "cleanup start", "late"]);
        assert.deepEqual(reports, []);
        assert.equal(lateReports.length, 1);
        const late = lateReports[0];
        assert.equal(late.cause, rejection);
        assert.equal(late.abortReason, abortReason);
        assert.equal(late.abortWaitMs, 0);
        assert.match(late.location.file, /child\.toss$/);
        cleanupGate.resolve();
        const error = await rejected;
        assert.equal(error.cause, cancel ? cancelReason : bodyReason);
        assert.equal(abortReason, cancel ? cancelReason : error);
        assert.equal(reports.length, 1);
        assert.equal(reports[0].error, error);
        const [timeout, cleanup] = reports[0].cleanupDescriptions;
        assert.equal(reports[0].cleanupDescriptions.length, 2);
        assert.match(timeout, /within 0 ms after abort/);
        assert.match(cleanup, /cleanupFailure/);
        assert.deepEqual(events, ["abort", "cleanup start", "late", "cleanup end", "diagnostic:promise", "catch"]);
      }
    `,
    );
    assert.equal(result.success, true, text(result.stderr));
    assert.equal(text(result.stderr), "");
  });

  Deno.test(`ordinary AOT waits for owned work on successful return (external=${external})`, async () => {
    const javascript = compile(
      `
%export(%async({
  $Effect spawn: %async({ %await(%js(childGate.promise)) }).
  $Effect hostOperation: %js(_ => hostGate.promise) abortWaitMs: 0.
  42
}) asJSCallback).
`,
      "join.toss",
      options,
    );
    const result = await executeModuleJavaScript(
      javascript,
      `
      import assert from "node:assert/strict";
      globalThis.childGate = Promise.withResolvers();
      globalThis.hostGate = Promise.withResolvers();
      let finished = false;
      const joined = value().then(result => { finished = true; return result; });
      childGate.resolve();
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(finished, false);
      hostGate.resolve();
      assert.equal(await joined, 42);
    `,
    );
    assert.equal(result.success, true, text(result.stderr));
    assert.equal(text(result.stderr), "");
  });
}
