import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const checkouts = Deno.args.length ? Deno.args : ["."];
const compilers = await Promise.all(checkouts.map(async (checkout) => ({
  checkout,
  ...await import(pathToFileURL(resolve(checkout, "src/compiler.ts")).href),
})));
const moduleUrl = (source) => `data:text/javascript;base64,${btoa(source)}`;
const fulfilled = Promise.resolve(42);
const workloads = [
  ["return", "42"],
  ["value await", "%await(42)"],
  ["host Promise await", "%await($input)"],
  ["Toss async await", "%await(%async({ 42 }) value)"],
];

async function measure(callback, iterations) {
  let sum = 0;
  const start = performance.now();
  for (let index = 0; index < iterations; index++) {
    sum += await callback(fulfilled);
  }
  const elapsed = performance.now() - start;
  assert.equal(sum, iterations * 42);
  return elapsed * 1e6 / iterations;
}

for (const external of [false, true]) {
  for (const [name, body] of workloads) {
    const callbacks = await Promise.all(compilers.map(async (compiler) => {
      const runtimeImport = external
        ? moduleUrl(compiler.generateRuntimeModule())
        : undefined;
      const compiled = compiler.compile(
        `%export(%async({ input -> ${body} }) asJSCallback).`,
        "async-ownership-benchmark.toss",
        { format: "esm", runtimeImport },
      );
      const { default: callback } = await import(moduleUrl(compiled));
      return callback;
    }));
    const samples = callbacks.map(() => []);
    for (const callback of callbacks) await measure(callback, 10_000);
    for (let round = 0; round < 7; round++) {
      for (let offset = 0; offset < callbacks.length; offset++) {
        const index = (round + offset) % callbacks.length;
        samples[index].push(await measure(callbacks[index], 50_000));
      }
    }
    const medians = samples.map((sample) => sample.sort((a, b) => a - b)[3]);
    console.log(`${external ? "external" : "embedded"} ${name}`);
    for (const [index, median] of medians.entries()) {
      console.log(
        `  ${checkouts[index]} ${median.toFixed(0)} ns/call (${
          (median / medians[0]).toFixed(2)
        }x)`,
      );
    }
  }
}
