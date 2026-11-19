import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [
  checkout = ".",
  runtime = "embedded",
  countArgument = "100000",
  retention = "toss",
] = Deno.args;
const count = Number(countArgument);
assert.ok(runtime === "embedded" || runtime === "external");
assert.ok(retention === "toss" || retention === "javascript");
assert.ok(Number.isSafeInteger(count) && count > 0);
assert.equal(typeof globalThis.gc, "function", "Use --v8-flags=--expose-gc");

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
#task bind: %async({ %await(42) }).
#store bind: { index ->
  ($state at: #results) at: ($index toString) put: ($task value).
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
async function medianRead(read) {
  const size = Math.min(count, 20000);
  const samples = [];
  for (let index = 0; index < 5; index++) {
    const start = performance.now();
    await readAll(read, size);
    samples.push((performance.now() - start) * 1e6 / size);
  }
  return Math.round(samples.sort((a, b) => a - b)[2]);
}

const warmup = Math.min(5000, count);
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
fixture.clear();
const before = await heap();

let start = performance.now();
launch(count);
const launched = performance.now();
await turn();
const drained = performance.now();
const launchNs = (drained - start) * 1e6 / count;
const launchSyncNs = (launched - start) * 1e6 / count;
const launchDrainNs = (drained - launched) * 1e6 / count;
const settled = await heap();
start = performance.now();
await readAll(fixture.read, count);
const tossAwaitNs = (performance.now() - start) * 1e6 / count;
start = performance.now();
const publicPromises = retention === "javascript" ? new Array(count) : null;
await readAll(
  publicPromises === null
    ? fixture.expose
    : (index) => (publicPromises[index] = fixture.expose(index)),
  count,
);
const firstJavaScriptNs = (performance.now() - start) * 1e6 / count;
if (publicPromises !== null) fixture.clear();
const exposed = await heap();
const repeatedReadNs = await medianRead(
  publicPromises === null
    ? fixture.expose
    : (index) => fixture.roundTrip(publicPromises[index]),
);
let roundTripEightNs;
let reexposeNs;
let afterRoundTrip;
if (publicPromises !== null) {
  roundTripEightNs = await medianRead(
    (index) => fixture.repeatRoundTrip(publicPromises[index]),
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
  checkout,
  runtime,
  retention,
  count,
  launchNs: Math.round(launchNs),
  launchSyncNs: Math.round(launchSyncNs),
  launchDrainNs: Math.round(launchDrainNs),
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
