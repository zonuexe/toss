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
    assert.equal(await read().catch(error => error), error);
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

for (const external of [false, true]) {
  const options = {
    format: "esm" as const,
    ...(external ? { runtimeImport } : { treeShakePrelude: true }),
  };
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
