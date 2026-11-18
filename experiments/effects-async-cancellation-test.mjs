import assert from "node:assert/strict";
import { compileExperimentalEffects } from "./effects-compiler.ts";
import { generateExperimentalEffectsRuntime } from "./effects-external-runtime.ts";

const moduleUrl = (source) => `data:text/javascript;base64,${btoa(source)}`;
const failureObserver = `
  export function onEffectFailure(diagnostic) {
    globalThis.reports.push(diagnostic);
    globalThis.events.push("diagnostic:" + diagnostic.boundary);
  }
`;
const options = {
  failureCarriers: true,
  asyncCancellation: true,
  failureObserverImport: moduleUrl(failureObserver),
};
const lateObserverImport = moduleUrl(`${failureObserver}
  export function onLateHostOperationFailure(failure) {
    lateReports.push(failure);
    events.push("late:" + failure.abortWaitMs);
    if (failure.cause === earlyReason) throw new Error("late hook threw");
    return Promise.reject(new Error("late hook rejected"));
  }
  export function onEffectObserverError() {
    events.push("unexpected observer error hook");
  }
`);
const runtimeImport = moduleUrl(generateExperimentalEffectsRuntime(options));
const source = `
%js((globalThis.events = [], globalThis.reports = [],
  globalThis.operation = Promise.withResolvers(),
  globalThis.finalizer = Promise.withResolvers(),
  globalThis.finalizerStarted = Promise.withResolvers(),
  globalThis.reason = new Error("cancel reason"), 0)).
#work bind: %async({
  $Effect onCancel: { 'outer' print. $outerFailure }.
  $Effect onCancel: %async({
    %js((events.push("inner:start"), finalizerStarted.resolve(), 0)).
    %await(%js(finalizer.promise)).
    %js(events.push("inner:end")).
    $innerFailure
  }).
  %await(%js(operation.promise)).
  'unexpected' print
}).
#task bind: ($work value).
#sibling bind: (%async({ %await(%js(operation.promise)) }) value).
#reason bind: %js(globalThis.reason).
#cancel bind: { $task cancel: $reason } asJSCallback.
#finished bind: (%async({ $Effect onCancel: { 'unexpected cleanup' print }. 17 }) value).
($finished cancel: 'ignored') print.
%js(p = $task, s = $sibling, cancel = $cancel; (async () => {
  const failure = p.catch(error => {
    events.push("catch");
    console.log("identity", error === reports[0].error, error.cause === reason);
  });
  console.log("requests", cancel(), cancel());
  await finalizerStarted.promise;
  console.log("during", reports.length, cancel());
  finalizer.resolve();
  await failure;
  operation.resolve(9);
  console.log("sibling", await s);
  console.log("after", cancel());
  console.log("events", events.join("|"));
  const [inner, outer] = reports[0].cleanupDescriptions;
  console.log("cleanup", inner.includes("innerFailure"), outer.includes("outerFailure"), reports.length);
})()).
`;

const expected = [
  "false",
  "requests true false",
  "during 0 false",
  "outer",
  "identity true true",
  "sibling 9",
  "after false",
  "events inner:start|inner:end|diagnostic:promise|catch",
  "cleanup true true 1",
  "",
].join("\n");
for (const config of [options, { ...options, runtimeImport }]) {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["eval", compileExperimentalEffects(source, "cancel.toss", config)],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  assert.equal(result.success, true, decoder.decode(result.stderr));
  assert.equal(decoder.decode(result.stdout), expected);
}

const race = `
%js((globalThis.events = [], globalThis.reports = [],
  globalThis.operation = Promise.withResolvers(), 0)).
#task bind: (%async({
  $Effect onCancel: { 'cleanup' print }.
  %await(%js(operation.promise)).
  'unexpected' print
}) value).
%js((addEventListener('unhandledrejection', e => {
  e.preventDefault();
  console.log(e.reason.cause, reports.length, events.join("|"));
}), operation.resolve(1), 0)).
($task cancel: 'first reason') print.
($task cancel: 'second reason') print.
`;
const raceResult = await new Deno.Command(Deno.execPath(), {
  args: ["eval", compileExperimentalEffects(race, "cancel-race.toss", options)],
  stdout: "piped",
  stderr: "piped",
}).output();
const decoder = new TextDecoder();
assert.equal(raceResult.success, true, decoder.decode(raceResult.stderr));
assert.equal(
  decoder.decode(raceResult.stdout),
  "true\nfalse\ncleanup\nfirst reason 1 diagnostic:unobserved-async\n",
);

const reentry = `
%js((globalThis.events = [], globalThis.reports = [], 0)).
#task bind: (%async({
  $Effect onCancel: { 'cleanup' print }.
  %await($Nil).
  %js(console.log("reentrant", globalThis.cancelNow()))
}) value).
#cancel bind: { $task cancel: 'reentrant reason' } asJSCallback.
%js(p = $task, f = $cancel; (globalThis.cancelNow = f,
  p.then(() => console.log("unexpected success"), error => {
    console.log(error.cause, reports.length);
  }), 0)).
`;
const reentryResult = await new Deno.Command(Deno.execPath(), {
  args: [
    "eval",
    compileExperimentalEffects(reentry, "cancel-reentry.toss", options),
  ],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(reentryResult.success, true, decoder.decode(reentryResult.stderr));
assert.equal(
  decoder.decode(reentryResult.stdout),
  "reentrant true\ncleanup\nreentrant reason 1\n",
);

const owned = `
%js((globalThis.events = [], globalThis.reports = [],
  globalThis.reason = new Error("root stop"),
  globalThis.grandStarted = Promise.withResolvers(),
  globalThis.grandGate = Promise.withResolvers(),
  globalThis.hostGate = Promise.withResolvers(),
  globalThis.hostDone = Promise.withResolvers(),
  globalThis.detachedGate = Promise.withResolvers(), 0)).
#parent bind: (%async({
  $Effect onCancel: { %js(events.push("parent cleanup")). $parentCleanup }.
  #detached bind: (%async({ %await(%js(detachedGate.promise)) }) value).
  %js(p = $detached; (globalThis.detached = p, 0)).
  #child bind: ($Effect spawn: %async({
    $Effect onCancel: { %js(events.push("child cleanup")). $childCleanup }.
    $Effect spawn: %async({
      $Effect onCancel: %async({
        %js((events.push("grandchild start"), grandStarted.resolve(), 0)).
        %await(%js(grandGate.promise)).
        %js(events.push("grandchild end")).
        $grandCleanup
      }).
      %await(%js(new Promise(() => {})))
    }).
    %await($Effect hostOperation: %js(signal => new Promise((_, reject) => {
      signal.addEventListener("abort", async () => {
        events.push("signal:" + (signal instanceof AbortSignal && signal.reason === reason));
        events.push("reentrant cancel:" + globalThis.cancelChild());
        await hostGate.promise;
        events.push("host cleanup");
        hostDone.resolve();
        reject(new Error("hostCleanup"));
      }, {once: true});
    })))
  })).
  #retryChild bind: { $child cancel: 'different' } asJSCallback.
  %js(f = $retryChild; (globalThis.cancelChild = f, 0)).
  $Effect hostOperation: %js(signal => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {once: true});
  })).
  %await($child)
}) value).
#reason bind: %js(globalThis.reason).
#cancel bind: { $parent cancel: $reason } asJSCallback.
%js(p = $parent, cancel = $cancel; (async () => {
  const failed = p.catch(error => {
    events.push("catch");
    console.log("identity", error.cause === reason, reports[0].error === error);
  });
  console.log("accepted", cancel());
  await grandStarted.promise;
  hostGate.resolve();
  await hostDone.promise;
  console.log("pending", reports.length);
  grandGate.resolve();
  await failed;
  detachedGate.resolve(42);
  console.log("detached", await detached);
  console.log(events.join("|"));
  console.log(reports.length, reports[0].cleanupDescriptions.map(s =>
    ["grandCleanup", "hostCleanup", "childCleanup", "parentCleanup"].find(x => s.includes(x))
  ).join("|"));
})()).
`;
for (const config of [options, { ...options, runtimeImport }]) {
  const result = await new Deno.Command(Deno.execPath(), {
    args: [
      "eval",
      compileExperimentalEffects(owned, "cancel-tree.toss", config),
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert.equal(result.success, true, decoder.decode(result.stderr));
  assert.equal(
    decoder.decode(result.stdout),
    [
      "accepted true",
      "pending 0",
      "identity true true",
      "detached 42",
      "signal:true|reentrant cancel:false|grandchild start|host cleanup|grandchild end|child cleanup|parent cleanup|diagnostic:promise|catch",
      "1 grandCleanup|hostCleanup|childCleanup|parentCleanup",
      "",
    ].join("\n"),
  );
}
function scopeExit(failInBody) {
  const failure = failInBody
    ? "%await(%js(failChild.promise)). $primaryFailure"
    : "$Effect spawn: %async({ %await(%js(failChild.promise)). $primaryFailure }). 99";
  return `
%js((globalThis.events = [], globalThis.reports = [],
  globalThis.childGate = Promise.withResolvers(),
  globalThis.hostGate = Promise.withResolvers(),
  globalThis.childCleaned = Promise.withResolvers(),
  globalThis.ignoreAbort = Promise.withResolvers(),
  globalThis.failChild = Promise.withResolvers(), 0)).
#normal bind: (%async({
  $Effect spawn: %async({ %await(%js(childGate.promise)). %js(events.push("child done")) }).
  $Effect hostOperation: %js(_ => hostGate.promise.then(() => events.push("host done"))).
  42
}) value).
#broken bind: (%async({
  $Effect onCancel: { 'unexpected parent cancellation cleanup' print }.
  $Effect spawn: %async({
    $Effect onCancel: { %js((events.push("child cleanup"), childCleaned.resolve(), 0)). $cleanupFailure }.
    %await(%js(new Promise(() => {})))
  }).
  $Effect hostOperation: %js(signal => {
    signal.addEventListener("abort", () => events.push("abort:" + signal.reason.message.includes("primaryFailure")), {once: true});
    return ignoreAbort.promise.then(() => events.push("ignored host done"));
  }).
  ${failure}
}) value).
%js(n = $normal, b = $broken; (async () => {
  let normalDone = false;
  const normal = n.then(v => { normalDone = true; events.push("return:" + v); });
  const broken = b.catch(e => events.push("catch:" + (reports[0].error === e && e.message.includes("primaryFailure"))));
  childGate.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  console.log("normal pending", normalDone, events.join("|"));
  hostGate.resolve();
  await normal;
  failChild.resolve();
  await childCleaned.promise;
  await new Promise(resolve => setTimeout(resolve, 0));
  console.log("failure pending", reports.length, events.join("|"));
  ignoreAbort.resolve();
  await broken;
  console.log(events.join("|"));
  console.log("reports", reports.length, reports[0].cleanupDescriptions.length,
    reports[0].cleanupDescriptions[0].includes("cleanupFailure"));
})()).
`;
}
for (const failInBody of [false, true]) {
  for (const config of [options, { ...options, runtimeImport }]) {
    const result = await new Deno.Command(Deno.execPath(), {
      args: [
        "eval",
        compileExperimentalEffects(
          scopeExit(failInBody),
          "owned-exit.toss",
          config,
        ),
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(result.success, true, decoder.decode(result.stderr));
    assert.equal(
      decoder.decode(result.stdout),
      [
        "normal pending false child done",
        "failure pending 0 child done|host done|return:42|abort:true|child cleanup",
        "child done|host done|return:42|abort:true|child cleanup|ignored host done|diagnostic:promise|catch:true",
        "reports 1 1 true",
        "",
      ].join("\n"),
    );
  }
}
for (const explicitAwait of [false, true]) {
  const result = await new Deno.Command(Deno.execPath(), {
    args: [
      "eval",
      compileExperimentalEffects(
        `
%js((globalThis.events = [], globalThis.reports = [],
  globalThis.hostFailure = new Error("host failure"), 0)).
#scope bind: (%async({
  #operation bind: ($Effect hostOperation: %js(_ => Promise.reject(hostFailure))).
  ${explicitAwait ? "%await($operation)" : "%await(%js(Promise.resolve())). 42"}
}) value).
%js(p = $scope; p.catch(e => console.log(e.cause === hostFailure,
  reports[0].error === e, reports.length, reports[0].cleanupDescriptions.length))).
`,
        "owned-host-failure.toss",
        options,
      ),
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert.equal(result.success, true, decoder.decode(result.stderr));
  assert.equal(decoder.decode(result.stdout), "true true 1 0\n");
}
function boundedHostWait(cancel) {
  return `
%js((globalThis.events = [], globalThis.reports = [],
  globalThis.lateReports = [],
  globalThis.earlyReason = Symbol("late during cleanup"),
  globalThis.laterReason = new Error("late after diagnostic"),
  globalThis.reason = new Error("explicit cancellation"),
  globalThis.late = Promise.withResolvers(),
  globalThis.later = Promise.withResolvers(),
  globalThis.lateSuccess = Promise.withResolvers(),
  globalThis.cleanupStarted = Promise.withResolvers(),
  globalThis.cleanupGate = Promise.withResolvers(),
  globalThis.bodyGate = Promise.withResolvers(), 0)).
#scope bind: (%async({
  $Effect spawn: %async({
    $Effect onCancel: %async({
      %js((events.push("cleanup start"), cleanupStarted.resolve(), 0)).
      %await(%js(cleanupGate.promise)).
      %js(events.push("cleanup end")).
      $cleanupFailure
    }).
    %await(%js(new Promise(() => {})))
  }).
  $Effect hostOperation: %js(signal => {
    signal.addEventListener("abort", () => {
      globalThis.abortReason = signal.reason;
      events.push("abort");
    }, {once: true});
    return late.promise;
  }) abortWaitMs: 0.
  $Effect hostOperation: %js(_ => later.promise) abortWaitMs: 1.
  $Effect hostOperation: %js(_ => later.promise) abortWaitMs: 0.
  $Effect hostOperation: %js(_ => lateSuccess.promise) abortWaitMs: 0.
  $Effect hostOperation: %js(signal => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("host cleanup")), {once: true});
  })) abortWaitMs: 0.
  %await(%js(bodyGate.promise)).
  $primaryFailure
}) value).
#stop bind: { $scope cancel: (%js(reason)) } asJSCallback.
%js(p = $scope, stop = $stop; (async () => {
  const failed = p.catch(error => {
    events.push("catch");
    console.log("primary", reports[0].error === error,
      ${cancel ? "error.cause === reason && abortReason === reason" : 'error === abortReason && error.message.includes("primaryFailure")'});
  });
  ${cancel ? "stop();" : "bodyGate.resolve();"}
  await cleanupStarted.promise;
  const turn = () => new Promise(resolve => setTimeout(resolve, 0));
  await turn();
  late.reject(earlyReason);
  await turn();
  console.log("during cleanup", reports.length, events.join("|"));
  cleanupGate.resolve();
  await failed;
  later.reject(laterReason);
  lateSuccess.resolve(42);
  await turn();
  console.log(events.join("|"));
  console.log("reports", reports.length, reports[0].cleanupDescriptions.map(s =>
    ["cleanupFailure", "did not settle within 0 ms", "did not settle within 1 ms", "host cleanup"].find(x => s.includes(x))
  ).join("|"));
  console.log("late reports", lateReports.length, lateReports.every((failure, index) =>
    failure.cause === [earlyReason, laterReason][index] &&
    failure.abortReason === abortReason &&
    failure.abortWaitMs === index &&
    failure.location.file === "bounded-host-wait.toss" &&
    failure.location.line > 0 && failure.location.column > 0 &&
    Object.isFrozen(failure) && Object.isFrozen(failure.location)));
})()).
`;
}
for (const cancel of [false, true]) {
  for (const config of [
    options,
    { ...options, runtimeImport },
    { ...options, failureObserverImport: lateObserverImport },
    { ...options, runtimeImport, failureObserverImport: lateObserverImport },
  ]) {
    const observing = config.failureObserverImport === lateObserverImport;
    const result = await new Deno.Command(Deno.execPath(), {
      args: [
        "eval",
        compileExperimentalEffects(boundedHostWait(cancel), "bounded-host-wait.toss", config),
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(result.success, true, decoder.decode(result.stderr));
    assert.equal(decoder.decode(result.stdout), [
      `during cleanup 0 abort|cleanup start${observing ? "|late:0" : ""}`,
      "primary true true",
      `abort|cleanup start${observing ? "|late:0" : ""}|cleanup end|diagnostic:promise|catch${observing ? "|late:1" : ""}`,
      "reports 1 cleanupFailure|did not settle within 0 ms|did not settle within 1 ms|did not settle within 0 ms|host cleanup",
      `late reports ${observing ? 2 : 0} true`,
      "",
    ].join("\n"));
  }
}
const deadlineOptions = await new Deno.Command(Deno.execPath(), {
  args: [
    "eval",
    compileExperimentalEffects(
      `
%js((globalThis.events = [], globalThis.reports = [],
  globalThis.hostGate = Promise.withResolvers(), 0)).
#ok bind: (%async({
  $Effect hostOperation: %js(_ => hostGate.promise) abortWaitMs: 0.
  42
}) value).
#invalid bind: %async({ ms ->
  $Effect hostOperation: %js(_ => console.log("unexpected factory call")) abortWaitMs: $ms
}) asJSCallback.
%js(p = $ok, invalid = $invalid; (async () => {
  let done = false;
  const result = p.then(value => { done = true; return value; });
  await new Promise(resolve => setTimeout(resolve, 0));
  console.log("before abort", done, reports.length);
  hostGate.resolve();
  console.log("normal result", await result);
  for (const ms of [-1, 0.5, 2147483648, "0"]) {
    await invalid(ms).catch(error => console.log(error.message.includes("abortWaitMs:")));
  }
})()).
`,
      "host-wait-options.toss",
      options,
    ),
  ],
  stdout: "piped",
  stderr: "piped",
}).output();
assert.equal(deadlineOptions.success, true, decoder.decode(deadlineOptions.stderr));
assert.equal(
  decoder.decode(deadlineOptions.stdout),
  "before abort false 0\nnormal result 42\ntrue\ntrue\ntrue\ntrue\n",
);
console.log(
  "PASS: async cancellation and owned work settle before the parent reports failure",
);
