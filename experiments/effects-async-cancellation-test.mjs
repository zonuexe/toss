import assert from "node:assert/strict";
import { compileExperimentalEffects } from "./effects-compiler.ts";
import { generateExperimentalEffectsRuntime } from "./effects-external-runtime.ts";

const moduleUrl = (source) => `data:text/javascript;base64,${btoa(source)}`;
const options = {
  failureCarriers: true,
  asyncCancellation: true,
  failureObserverImport: moduleUrl(`
    export function onEffectFailure(diagnostic) {
      globalThis.reports.push(diagnostic);
      globalThis.events.push("diagnostic:" + diagnostic.boundary);
    }
  `),
};
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
console.log(
  "PASS: async cancellation unwinds cleanup before exposing the original cause",
);
