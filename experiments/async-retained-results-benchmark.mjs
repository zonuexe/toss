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
#clear bind: { $state at: #results put: ($Object clone). $Nil } asJSCallback.
%export(%js(store = $store, read = $read, expose = $expose, roundTrip = $roundTrip, clear = $clear;
  ({store, read, expose, roundTrip, clear}))).
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

const warmup = Math.min(5000, count);
launch(warmup);
await turn();
await readAll(fixture.read, warmup);
await readAll(fixture.expose, warmup);
if (retention === "javascript") {
  await readAll((index) => fixture.roundTrip(fixture.expose(index)), warmup);
}
fixture.clear();
const before = await heap();

let start = performance.now();
launch(count);
await turn();
const launchNs = (performance.now() - start) * 1e6 / count;
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
start = performance.now();
await readAll(
  publicPromises === null
    ? fixture.expose
    : (index) => fixture.roundTrip(publicPromises[index]),
  count,
);
const repeatedReadNs = (performance.now() - start) * 1e6 / count;
if (publicPromises !== null) publicPromises.length = 0;
fixture.clear();
const cleared = await heap();

console.log(JSON.stringify({
  checkout,
  runtime,
  retention,
  count,
  launchNs: Math.round(launchNs),
  tossAwaitNs: Math.round(tossAwaitNs),
  firstJavaScriptNs: Math.round(firstJavaScriptNs),
  [publicPromises === null ? "cachedJavaScriptNs" : "roundTripNs"]: Math.round(
    repeatedReadNs,
  ),
  settledBytes: Math.round((settled - before) / count),
  exposedBytes: Math.round((exposed - before) / count),
  clearedBytes: Math.round((cleared - before) / count),
}));
