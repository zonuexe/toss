import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [
  checkout = ".",
  runtime = "embedded",
  scenario = "wasm",
  countArgument = "100000",
] = Deno.args;
const count = Number(countArgument);
assert.ok(runtime === "embedded" || runtime === "external");
assert.ok(["symbol", "wasm", "wasm-reuse"].includes(scenario));
assert.ok(Number.isSafeInteger(count) && count > 0);
assert.equal(typeof globalThis.gc, "function", "Use --v8-flags=--expose-gc");

// (module (type (struct)) (func (export "mak") (result externref)
//   (extern.convert_any (struct.new_default 0))))
const wasmCode = Uint8Array.fromBase64(
  "AGFzbQEAAAABBwJfAGAAAW8DAgEBBwcBA21hawAACgkBBwD7AQD7Gws=",
);
const { mak } =
  new WebAssembly.Instance(new WebAssembly.Module(wasmCode)).exports;
const wasm = scenario !== "symbol";
const reuse = scenario === "wasm-reuse";
const { compile, generateRuntimeModule } = await import(
  pathToFileURL(resolve(checkout, "src/compiler.ts")).href
);
const moduleUrl = (source) => "data:text/javascript;base64," + btoa(source);
const { default: fixture } = await import(moduleUrl(compile(
  `
#start bind: %async({ item -> [$item] }) asJSCallback.
#read bind: %async({ input -> (%await($input)) at: 0 }) asJSCallback.
%export(%js(start = $start, read = $read; ({start, read}))).
`,
  "fallback-probe.toss",
  {
    format: "esm",
    runtimeImport: runtime === "external"
      ? moduleUrl(generateRuntimeModule())
      : undefined,
  },
)));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function heap() {
  await tick();
  for (let pass = 0; pass < 3; pass++) {
    globalThis.gc();
    await tick();
  }
  return Deno.memoryUsage().heapUsed;
}
const originalThen = Promise.prototype.then;
function publish(keys) {
  let shared;
  let returned;
  Promise.prototype.then = function (...reactions) {
    Reflect.apply(originalThen, this, reactions);
    return shared;
  };
  try {
    for (let index = 0; index < keys.length; index++) {
      shared = keys[index];
      returned = fixture.start(index);
    }
  } finally {
    Promise.prototype.then = originalThen;
  }
  assert.equal(returned, shared);
}
const make = wasm ? mak : () => Symbol();
const values = (size) => Array.from({ length: size }, () => make());
const keys = reuse ? Array(count).fill(mak()) : values(count);
publish(keys.slice(0, 5000));
const before = await heap();
let start = performance.now();
publish(keys);
const publicationNs = (performance.now() - start) * 1e6 / count;
if (!reuse) publish(values(count));
const retained = await heap();
if (reuse) assert.equal(await fixture.read(keys[0]), count - 1);
const firstKey = reuse ? keys[0] : make();
start = performance.now();
publish([firstKey]);
const firstCallbackMs = performance.now() - start;
let roundTripNs;
if (scenario === "wasm") {
  const size = Math.min(count, 20000);
  const samples = [];
  for (let pass = 0; pass < 5; pass++) {
    let sum = 0;
    start = performance.now();
    for (let i = 0; i < size; i++) sum += await fixture.read(keys[i]);
    samples.push((performance.now() - start) * 1e6 / size);
    assert.equal(sum, size * (size - 1) / 2);
  }
  roundTripNs = samples.sort((a, b) => a - b)[2];
}
assert.equal(keys.length, count);
console.log(
  JSON.stringify({
    checkout,
    runtime,
    scenario,
    publicationNs,
    roundTripNs,
    firstCallbackMs,
    retainedBytes: (retained - before) / count,
  }),
);
