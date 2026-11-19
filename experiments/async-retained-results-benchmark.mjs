import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [
  checkout = ".",
  runtime = "embedded",
  countArgument = "100000",
  retention = "toss",
  scenario = "all",
  producer = "literal",
  extraWarmupArgument = "0",
  phaseTrace = "off",
] = Deno.args;
const count = Number(countArgument);
const extraWarmup = Number(extraWarmupArgument);
assert.ok(runtime === "embedded" || runtime === "external");
assert.ok(retention === "toss" || retention === "javascript");
assert.ok(["all", "launch", "one", "eight", "first"].includes(scenario));
assert.ok(producer === "literal" || producer === "dynamic");
assert.ok(
  scenario === "all" || scenario === "launch" || retention === "javascript",
);
assert.ok(Number.isSafeInteger(count) && count > 0);
assert.ok(
  Number.isSafeInteger(extraWarmup) && extraWarmup >= 0 && extraWarmup <= count,
);
assert.ok(
  extraWarmup === 0 || (scenario === "all" && retention === "javascript"),
);
assert.ok(phaseTrace === "off" || phaseTrace === "on");
assert.equal(typeof globalThis.gc, "function", "Use --v8-flags=--expose-gc");

function markPhase(phase) {
  if (phaseTrace === "on") {
    console.log("PHASE", phase, performance.now().toFixed(3));
  }
}

markPhase("compile:start");
const { compile, generateRuntimeModule } = await import(
  pathToFileURL(resolve(checkout, "src/compiler.ts")).href
);
const moduleUrl = (source) => `data:text/javascript;base64,${btoa(source)}`;
const runtimeImport = runtime === "external"
  ? moduleUrl(generateRuntimeModule())
  : undefined;
const source = `
#state bind: $Object clone.
$state at: #results put: ($Object clone).
#task bind: %async({ ${
  producer === "literal" ? "%await(42)" : "input -> %await($input)"
} }).
#store bind: { index ->
  ($state at: #results) at: ($index toString) put: ($task ${
  producer === "literal" ? "value" : "value: 42"
}).
  $Nil
} asJSCallback.
#read bind: %async({ index -> %await(($state at: #results) at: ($index toString)) }) asJSCallback.
#expose bind: { index -> ($state at: #results) at: ($index toString) } asJSCallback.
#roundTrip bind: %async({ input -> %await($input) }) asJSCallback.
#repeatRoundTrip bind: %async({ input -> ${
  Array(8).fill("%await($input)").join(". ")
} }) asJSCallback.
#reexpose bind: { input -> $input } asJSCallback.
#clear bind: { $state at: #results put: ($Object clone). $Nil } asJSCallback.
%export(%js(store = $store, read = $read, expose = $expose, roundTrip = $roundTrip,
  repeatRoundTrip = $repeatRoundTrip, reexpose = $reexpose, clear = $clear;
  ({store, read, expose, roundTrip, repeatRoundTrip, reexpose, clear}))).
`;
const { default: fixture } = await import(
  moduleUrl(
    compile(source, "async-retained-results-benchmark.toss", {
      format: "esm",
      runtimeImport,
    }),
  )
);
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
async function heap() {
  await turn();
  for (let index = 0; index < 3; index++) {
    globalThis.gc();
    await turn();
  }
  return Deno.memoryUsage().heapUsed;
}
function launch(size) {
  for (let index = 0; index < size; index++) fixture.store(index);
}
async function readAll(read, size) {
  let sum = 0;
  for (let index = 0; index < size; index++) sum += await read(index);
  assert.equal(sum, size * 42);
}
async function medianRead(read, label) {
  const size = Math.min(count, 20000);
  const samples = [];
  for (let index = 0; index < 5; index++) {
    markPhase(`${label}:${index}:start`);
    const start = performance.now();
    await readAll(read, size);
    samples.push((performance.now() - start) * 1e6 / size);
    markPhase(`${label}:${index}:end`);
  }
  return Math.round(samples.sort((a, b) => a - b)[2]);
}

async function measureLaunch() {
  const start = performance.now();
  launch(count);
  const launched = performance.now();
  await turn();
  const drained = performance.now();
  const ns = (ms) => Math.round(ms * 1e6 / count);
  return {
    launchNs: ns(drained - start),
    launchSyncNs: ns(launched - start),
    launchDrainNs: ns(drained - launched),
  };
}

const configuration = {
  checkout,
  runtime,
  retention,
  count,
  scenario,
  producer,
  extraWarmup,
};
const warmup = Math.min(5000, count);
if (scenario === "launch") {
  launch(warmup);
  await turn();
  fixture.clear();
  await heap();
  markPhase("launch:start");
  const timings = await measureLaunch();
  markPhase("launch:end");
  assert.equal(await fixture.expose(count - 1), 42);
  console.log(JSON.stringify({ ...configuration, ...timings }));
  Deno.exit(0);
}

if (scenario === "one" || scenario === "eight") {
  const before = await heap();
  launch(count);
  await turn();
  const promises = new Array(count);
  await readAll((index) => (promises[index] = fixture.expose(index)), count);
  fixture.clear();
  const exposed = await heap();
  const callback = scenario === "one"
    ? fixture.roundTrip
    : fixture.repeatRoundTrip;
  const read = (index) => callback(promises[index]);
  await readAll(read, warmup);
  const elapsed = await medianRead(read, scenario);
  for (const promise of promises) {
    assert.equal(fixture.reexpose(promise), promise);
  }
  const afterReads = await heap();
  console.log(JSON.stringify({
    ...configuration,
    [scenario === "one" ? "roundTripNs" : "roundTripEightNs"]: elapsed,
    exposedBytes: Math.round((exposed - before) / count),
    afterRoundTripBytes: Math.round((afterReads - before) / count),
  }));
  Deno.exit(0);
}

markPhase("initialWarmup:start");
launch(warmup);
await turn();
await readAll(fixture.read, warmup);
await readAll(fixture.expose, warmup);
if (retention === "javascript") {
  await readAll((index) => fixture.roundTrip(fixture.expose(index)), warmup);
  await readAll(
    (index) => fixture.repeatRoundTrip(fixture.expose(index)),
    warmup,
  );
  for (let index = 0; index < warmup; index++) {
    fixture.reexpose(fixture.expose(index));
  }
}
markPhase("initialWarmup:end");
fixture.clear();
const before = await heap();

markPhase("launch:start");
const launchTimings = await measureLaunch();
markPhase("launch:end");
const settled = await heap();
markPhase("tossRead:start");
let start = performance.now();
await readAll(fixture.read, count);
const tossAwaitNs = (performance.now() - start) * 1e6 / count;
markPhase("tossRead:end");
markPhase("publish:start");
start = performance.now();
const publicPromises = retention === "javascript" ? new Array(count) : null;
await readAll(
  publicPromises === null
    ? fixture.expose
    : (index) => (publicPromises[index] = fixture.expose(index)),
  count,
);
const firstJavaScriptNs = (performance.now() - start) * 1e6 / count;
markPhase("publish:end");
if (publicPromises !== null) fixture.clear();
const exposed = await heap();
if (publicPromises !== null && extraWarmup > 0) {
  markPhase("oneWarmup:start");
  await readAll(
    (index) => fixture.roundTrip(publicPromises[index]),
    extraWarmup,
  );
  markPhase("oneWarmup:end");
}
if (scenario === "first") {
  assert.ok(publicPromises !== null);
  markPhase("first:start");
  const start = performance.now();
  const pending = fixture.roundTrip(publicPromises[0]);
  const returned = performance.now();
  const value = await pending;
  const settled = performance.now();
  markPhase("first:end");
  assert.equal(value, 42);
  console.log(JSON.stringify({
    ...configuration,
    firstCallbackSyncMs: returned - start,
    firstCallbackMs: settled - start,
  }));
  Deno.exit(0);
}
const repeatedReadNs = await medianRead(
  publicPromises === null
    ? fixture.expose
    : (index) => fixture.roundTrip(publicPromises[index]),
  publicPromises === null ? "cached" : "one",
);
let roundTripEightNs;
let reexposeNs;
let afterRoundTrip;
if (publicPromises !== null) {
  roundTripEightNs = await medianRead(
    (index) => fixture.repeatRoundTrip(publicPromises[index]),
    "eight",
  );
  start = performance.now();
  for (const promise of publicPromises) {
    if (fixture.reexpose(promise) !== promise) {
      throw new Error("Round trip changed public Promise identity");
    }
  }
  reexposeNs = Math.round((performance.now() - start) * 1e6 / count);
  afterRoundTrip = Math.round(((await heap()) - before) / count);
}
if (publicPromises !== null) publicPromises.length = 0;
fixture.clear();
const cleared = await heap();

console.log(JSON.stringify({
  ...configuration,
  ...launchTimings,
  tossAwaitNs: Math.round(tossAwaitNs),
  firstJavaScriptNs: Math.round(firstJavaScriptNs),
  [publicPromises === null ? "cachedJavaScriptNs" : "roundTripNs"]: Math.round(
    repeatedReadNs,
  ),
  roundTripEightNs,
  reexposeNs,
  afterRoundTripBytes: afterRoundTrip,
  settledBytes: Math.round((settled - before) / count),
  exposedBytes: Math.round((exposed - before) / count),
  clearedBytes: Math.round((cleared - before) / count),
}));
