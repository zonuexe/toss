import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [
  checkout = ".",
  runtime = "embedded",
  profile = "mixed",
  secondsArgument = "60",
  mode = "timing",
  extraArgument = "0",
  optionsArgument = "{}",
] = Deno.args;
const seconds = Number(secondsArgument);
const extra = Number(extraArgument);
const {
  batch: batchSize = 256,
  period: periodMs = 10,
  anchorKeys: anchorCount = profile === "mixed" ? 0 : 100000,
  anchorResults = profile === "anchored" ? anchorCount : 0,
  knownFallback = false,
} = JSON.parse(optionsArgument);
assert.ok(runtime === "embedded" || runtime === "external");
assert.ok(["timing", "trace", "scheduled"].includes(mode));
assert.ok(
  profile === "mixed" || profile === "anchored" ||
    (profile === "keys" && mode === "scheduled"),
);
assert.ok(Number.isFinite(seconds) && seconds >= 1);
assert.ok(Number.isSafeInteger(extra) && extra >= 0);
assert.ok(extra === 0 || mode === "scheduled");
assert.ok(
  Number.isSafeInteger(batchSize) && batchSize > 0 && batchSize % 16 === 0,
);
assert.ok(Number.isFinite(periodMs) && periodMs >= 1);
assert.ok(Number.isSafeInteger(anchorCount) && anchorCount >= 0);
assert.ok(
  Number.isSafeInteger(anchorResults) && anchorResults >= 0 &&
    anchorResults <= anchorCount,
);
assert.equal(typeof knownFallback, "boolean");
assert.ok(mode === "scheduled" || optionsArgument === "{}");
const trace = mode === "trace";

// (module (type (struct)) (func (export "mak") (result externref)
//   (extern.convert_any (struct.new_default 0))))
const wasmCode = Uint8Array.fromBase64(
  "AGFzbQEAAAABBwJfAGAAAW8DAgEBBwcBA21hawAACgkBBwD7AQD7Gws=",
);
const { mak } =
  new WebAssembly.Instance(new WebAssembly.Module(wasmCode)).exports;
const { compile, generateRuntimeModule } = await import(
  pathToFileURL(resolve(checkout, "src/compiler.ts")).href
);
const moduleUrl = (source) => "data:text/javascript;base64," + btoa(source);
function traceFallback(source) {
  if (knownFallback) {
    const site = "  static set(value, reference) {";
    assert.equal(source.split(site).length, 2);
    return source.replace(
      site,
      `${site}
    if (globalThis.tossWasmKnownFallback === true) {
      hostReferences.set(value, reference);
      return;
    }`,
    );
  }
  if (!trace) return source;
  const site = "      hostReferences.set(value, reference);\n      return;";
  assert.equal(source.split(site).length, 2);
  return source.replace(
    site,
    `      const mapStart = performance.now();
      hostReferences.set(value, reference);
      globalThis.tossWasmChurnSetMs = performance.now() - mapStart;
      return;`,
  );
}
const source = compile(
  `
#start bind: %async({ [42] }) asJSCallback.
#read bind: %async({ input -> (%await($input)) at: 0 }) asJSCallback.
%export(%js(start = $start, read = $read; ({start, read}))).
`,
  "wasm-churn-benchmark.toss",
  {
    format: "esm",
    runtimeImport: runtime === "external"
      ? moduleUrl(traceFallback(generateRuntimeModule()))
      : undefined,
  },
);
const { default: fixture } = await import(
  moduleUrl(runtime === "embedded" ? traceFallback(source) : source)
);

const bounds = [
  0.001,
  0.002,
  0.003,
  0.004,
  0.005,
  0.008,
  0.012,
  0.016,
  0.025,
  0.040,
  0.060,
  0.1,
  0.2,
  0.4,
  0.6,
  1,
  2,
  4,
  8,
  16,
  32,
  64,
  128,
  256,
  512,
  1024,
];
class Latencies {
  counts = new Uint32Array(bounds.length + 1);
  count = 0;
  over1ms = 0;
  over8ms = 0;
  over16ms = 0;
  maxMs = 0;

  add(ms) {
    let index = 0;
    while (index < bounds.length && ms > bounds[index]) index++;
    this.counts[index]++;
    this.count++;
    if (ms >= 1) this.over1ms++;
    if (ms >= 8) this.over8ms++;
    if (ms >= 16) this.over16ms++;
    if (ms > this.maxMs) this.maxMs = ms;
  }

  quantileUpperMs(fraction) {
    let accumulated = 0;
    for (let i = 0; i < this.counts.length; i++) {
      accumulated += this.counts[i];
      if (accumulated >= Math.ceil(fraction * this.count)) {
        return bounds[i] ?? this.maxMs;
      }
    }
  }

  report() {
    const { count, over1ms, over8ms, over16ms, maxMs } = this;
    return {
      count,
      over1ms,
      over8ms,
      over16ms,
      maxMs,
      ...(count > 0 && {
        p50UpperMs: this.quantileUpperMs(0.5),
        p99UpperMs: this.quantileUpperMs(0.99),
        p999UpperMs: this.quantileUpperMs(0.999),
      }),
    };
  }
}

const registrations = new Latencies();
const firstAfterSlow = new Latencies();
const reads = new Latencies();
const readsAfterSlowBatch = new Latencies();
const mapWrites = new Latencies();
const firstAfterSlowMap = new Latencies();
const readsAfterSlowMapBatch = new Latencies();
const registrationQueue = new Latencies();
const registrationEndToEnd = new Latencies();
let previousWasSlow = false;
let previousMapWasSlow = false;
let slowMapInBatch = false;
let batch = 0;
const nativeThen = Promise.prototype.then;
function publish(keys, measured, due) {
  let current;
  let returned;
  let slowInBatch = false;
  slowMapInBatch = false;
  Promise.prototype.then = function (...reactions) {
    Reflect.apply(nativeThen, this, reactions);
    return current;
  };
  if (knownFallback) globalThis.tossWasmKnownFallback = true;
  try {
    for (const key of keys) {
      current = key;
      if (!measured) {
        returned = fixture.start();
        continue;
      }
      const start = performance.now();
      returned = fixture.start();
      const end = performance.now();
      const elapsed = end - start;
      registrations.add(elapsed);
      if (due !== undefined) {
        registrationQueue.add(start - due);
        registrationEndToEnd.add(end - due);
      }
      if (previousWasSlow) firstAfterSlow.add(elapsed);
      previousWasSlow = elapsed >= 1;
      if (previousWasSlow) slowInBatch = true;
      if (trace) {
        const setMs = globalThis.tossWasmChurnSetMs;
        mapWrites.add(setMs);
        if (previousMapWasSlow) firstAfterSlowMap.add(elapsed);
        previousMapWasSlow = setMs >= 1;
        if (previousMapWasSlow) slowMapInBatch = true;
        if (previousWasSlow) {
          console.log(
            "SLOW_PUBLISH",
            batch,
            registrations.count,
            elapsed,
            setMs,
          );
        }
      }
    }
  } finally {
    Promise.prototype.then = nativeThen;
    if (knownFallback) globalThis.tossWasmKnownFallback = false;
  }
  assert.equal(returned, current);
  return slowInBatch;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const anchors = [];
while (anchors.length < anchorCount) {
  const size = Math.min(512, anchorCount - anchors.length);
  const keys = Array.from({ length: size }, mak);
  const published = Math.min(size, Math.max(0, anchorResults - anchors.length));
  if (published > 0) publish(keys.slice(0, published), false);
  anchors.push(...keys);
  await wait(0);
}
const cohorts = [
  { size: batchSize * 10 / 16, slots: new Array(Math.ceil(40 / periodMs)) },
  { size: batchSize * 5 / 16, slots: new Array(Math.ceil(1280 / periodMs)) },
  { size: batchSize / 16, slots: new Array(Math.ceil(20480 / periodMs)) },
];
const intervalMs = 5;
if (mode === "scheduled") {
  const readPeriodMs = 10;
  const publicationSlots = Math.ceil(seconds * 1000 / periodMs);
  const readSlots = Math.ceil(
    (seconds * 1000 - readPeriodMs / 2) / readPeriodMs,
  );
  const candidates = [];
  const readQueue = new Latencies();
  const readEndToEnd = new Latencies();
  let publications = 0;
  let readRequests = 0;
  console.log("SCHEDULE_START");
  const started = performance.now();
  while (publications < publicationSlots || readRequests < readSlots) {
    const publishDue = publications < publicationSlots
      ? started + publications * periodMs
      : Infinity;
    const readDue = readRequests < readSlots
      ? started + readRequests * readPeriodMs + readPeriodMs / 2
      : Infinity;
    const due = Math.min(publishDue, readDue);
    while (performance.now() < due) {
      await wait(Math.ceil(due - performance.now()));
    }
    if (publishDue <= readDue) {
      const keys = Array.from({ length: batchSize + extra }, mak);
      publish(keys, true, due);
      let offset = 0;
      for (const [index, { size, slots }] of cohorts.entries()) {
        const slot = publications % slots.length;
        const retained = keys.slice(offset, offset + size);
        const targets = slots[slot] ?? retained;
        candidates[index] = targets[publications % size];
        slots[slot] = retained;
        offset += size;
      }
      publications++;
    } else {
      const start = performance.now();
      const result = await fixture.read(
        candidates[readRequests % cohorts.length],
      );
      const end = performance.now();
      assert.equal(result, 42);
      reads.add(end - start);
      readQueue.add(start - due);
      readEndToEnd.add(end - due);
      readRequests++;
    }
  }
  const durationMs = performance.now() - started;
  assert.equal(anchors.length, anchorCount);
  assert.equal(registrations.count, publicationSlots * (batchSize + extra));
  assert.equal(reads.count, readSlots);
  console.log("SCHEDULE_END");
  console.log(JSON.stringify({
    runtime,
    profile,
    mode,
    durationMs,
    seconds,
    periodMs,
    batchSize,
    extra,
    anchorCount,
    anchorResults,
    knownFallback,
    publicationsPerSecond: registrations.count * 1000 / durationMs,
    registrations: registrations.report(),
    registrationQueue: registrationQueue.report(),
    registrationEndToEnd: registrationEndToEnd.report(),
    reads: reads.report(),
    readQueue: readQueue.report(),
    readEndToEnd: readEndToEnd.report(),
    heapBytes: Deno.memoryUsage().heapUsed,
  }));
  Deno.exit(0);
}
const started = performance.now();
while (performance.now() - started < seconds * 1000) {
  if (trace) console.log("BATCH", batch, performance.now());
  const keys = Array.from({ length: batchSize }, mak);
  const slowInBatch = publish(keys, true);
  let offset = 0;
  for (const { size, slots } of cohorts) {
    const slot = batch % slots.length;
    const targets = slots[slot] ?? keys.slice(offset, offset + size);
    slots[slot] = keys.slice(offset, offset + size);
    offset += size;
    const start = performance.now();
    const result = await fixture.read(targets[batch % size]);
    const elapsed = performance.now() - start;
    assert.equal(result, 42);
    reads.add(elapsed);
    if (slowInBatch) readsAfterSlowBatch.add(elapsed);
    if (slowMapInBatch) readsAfterSlowMapBatch.add(elapsed);
    if (trace && elapsed >= 1) console.log("SLOW_READ", batch, elapsed);
  }
  if (anchors.length > 0) {
    const start = performance.now();
    const result = await fixture.read(anchors[(batch * 97) % anchorCount]);
    const elapsed = performance.now() - start;
    assert.equal(result, 42);
    reads.add(elapsed);
    if (slowInBatch) readsAfterSlowBatch.add(elapsed);
    if (slowMapInBatch) readsAfterSlowMapBatch.add(elapsed);
    if (trace && elapsed >= 1) console.log("SLOW_READ", batch, elapsed);
  }
  if (trace) console.log("BATCH_END", batch, performance.now());
  batch++;
  await wait(intervalMs);
}
const durationMs = performance.now() - started;
assert.equal(anchors.length, anchorCount);
console.log(JSON.stringify({
  runtime,
  profile,
  mode,
  durationMs,
  batch,
  batchSize,
  intervalMs,
  anchorCount,
  registrations: registrations.report(),
  firstAfterSlow: firstAfterSlow.report(),
  reads: reads.report(),
  readsAfterSlowBatch: readsAfterSlowBatch.report(),
  ...(trace && {
    mapWrites: mapWrites.report(),
    firstAfterSlowMap: firstAfterSlowMap.report(),
    readsAfterSlowMapBatch: readsAfterSlowMapBatch.report(),
  }),
  heapBytes: Deno.memoryUsage().heapUsed,
}));
