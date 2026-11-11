import { compile } from "../src/compiler.ts";
import { compileExperimentalEffects } from "./effects-compiler.ts";

// Each sample runs a complete artifact, including runtime initialization.
// The warmups and samples use the same already-compiled JavaScript function.
const workloads = [
  {
    name: "message dispatch (10,000 iterations)",
    source:
      "#result bind: (10000 times: { 1 add: 2 }). %js(v = $result; (() => { if (v !== 3) throw Error('wrong result'); })()).",
  },
  {
    name: "array map callbacks (2,000 maps)",
    source:
      "#result bind: (2000 times: { [1, 2, 3, 4, 5] map: { x -> $x add: 1 } }). %js(v = $result; (() => { if (v.length !== 5 || v[4] !== 6) throw Error('wrong result'); })()).",
  },
  {
    name: "dynamic method callbacks (10,000 calls)",
    source:
      "#o bind: $Object clone. $o at: 'run:' put: { x -> $x add: 1 }. #result bind: (10000 times: { $o run: 2 }). %js(v = $result; (() => { if (v !== 3) throw Error('wrong result'); })()).",
  },
  {
    name: "handled effect and resume (2,000 requests)",
    source:
      "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: $p }. #result bind: ({ 2000 times: { $Effect raise: #A with: 3 } } handleWith: $h). %js(v = $result; (() => { if (v !== 3) throw Error('wrong result'); })()).",
    effect: true,
  },
  {
    name: "effect through dynamic map callback (1,500 requests)",
    source:
      "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: $p }. #o bind: $Object clone. $o at: 'run:' put: { x -> $Effect raise: #A with: $x }. #result bind: ({ 500 times: { [1, 2, 3] map: { x -> $o run: $x } } } handleWith: $h). %js(v = $result; (() => { if (v.length !== 3 || v[2] !== 3) throw Error('wrong result'); })()).",
    effect: true,
  },
];

function measure(javascript) {
  const run = new Function(javascript);
  for (let i = 0; i < 3; i++) run();
  const samples = [];
  for (let i = 0; i < 7; i++) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    bytes: new TextEncoder().encode(javascript).length,
    medianMs: samples[3],
  };
}

console.log(
  `Deno ${Deno.version.deno}; V8 ${Deno.version.v8}; ${Deno.build.os}/${Deno.build.arch}`,
);
console.log(
  "Warmups: 3; samples: 7; median includes artifact runtime initialization.",
);
for (const workload of workloads) {
  console.log(`\n${workload.name}`);
  if (!workload.effect) {
    console.log(
      "  standard    ",
      measure(compile(workload.source, "benchmark.toss")),
    );
  }
  console.log(
    "  experimental",
    measure(compileExperimentalEffects(workload.source, "benchmark.toss")),
  );
  console.log(
    "  shared dispatch",
    measure(compileExperimentalEffects(workload.source, "benchmark.toss", {
      sharedDispatchTables: true,
    })),
  );
  console.log(
    "  direct number",
    measure(compileExperimentalEffects(workload.source, "benchmark.toss", {
      directNumberSends: true,
    })),
  );
  console.log(
    "  both options",
    measure(compileExperimentalEffects(workload.source, "benchmark.toss", {
      directNumberSends: true,
      sharedDispatchTables: true,
    })),
  );
}
