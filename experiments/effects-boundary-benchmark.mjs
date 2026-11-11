import { compileExperimentalEffects } from "./effects-compiler.ts";

const workloads = [
  [
    "dynamic map callbacks",
    "#r bind: (2000 times: { [1, 2, 3, 4, 5] map: { x -> $x add: 1 } }). %js(v = $r; (() => { if (v[4] !== 6) throw Error('wrong result'); })()).",
  ],
  [
    "dynamic method calls",
    "#o bind: $Object clone. $o at: 'run:' put: { x -> $x add: 1 }. #r bind: (10000 times: { $o run: 2 }). %js(v = $r; (() => { if (v !== 3) throw Error('wrong result'); })()).",
  ],
  [
    "effectful dynamic callbacks",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: $p }. #o bind: $Object clone. $o at: 'run:' put: { x -> $Effect raise: #A with: $x }. #r bind: ({ 500 times: { [1, 2, 3] map: { x -> $o run: $x } } } handleWith: $h). %js(v = $r; (() => { if (v[2] !== 3) throw Error('wrong result'); })()).",
  ],
];
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
function timed(run) {
  const start = performance.now();
  run();
  return performance.now() - start;
}
console.log(
  `Deno ${Deno.version.deno}; V8 ${Deno.version.v8}; ${Deno.build.os}/${Deno.build.arch}`,
);
console.log(
  "8 warmups per variant; 30 paired samples, alternating order; complete artifacts include initialization.",
);
for (const [name, source] of workloads) {
  const baseline = new Function(
    compileExperimentalEffects(source, "boundary-bench.toss", {
      sharedDispatchTables: true,
    }),
  );
  const direct = new Function(
    compileExperimentalEffects(source, "boundary-bench.toss", {
      sharedDispatchTables: true,
      directBoundarySteps: true,
    }),
  );
  for (let i = 0; i < 8; i++) {
    baseline();
    direct();
  }
  const baselineTimes = [];
  const directTimes = [];
  const ratios = [];
  for (let i = 0; i < 30; i++) {
    let a;
    let b;
    if (i % 2 === 0) {
      a = timed(baseline);
      b = timed(direct);
    } else {
      b = timed(direct);
      a = timed(baseline);
    }
    baselineTimes.push(a);
    directTimes.push(b);
    ratios.push(b / a);
  }
  console.log(name, {
    baselineMs: median(baselineTimes),
    directMs: median(directTimes),
    pairedRatio: median(ratios),
  });
}
