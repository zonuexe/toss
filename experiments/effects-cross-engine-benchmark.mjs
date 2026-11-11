import { compileExperimentalEffects } from "./effects-compiler.ts";

const sources = [
  [
    "map callbacks",
    "#r bind: (2000 times: { [1, 2, 3, 4, 5] map: { x -> $x add: 1 } }). %js(v = $r; (() => { if (v[4] !== 6) throw Error('wrong result'); })()).",
  ],
  [
    "dynamic methods",
    "#o bind: $Object clone. $o at: 'run:' put: { x -> $x add: 1 }. #r bind: (10000 times: { $o run: 2 }). %js(v = $r; (() => { if (v !== 3) throw Error('wrong result'); })()).",
  ],
  [
    "effectful callbacks",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: $p }. #o bind: $Object clone. $o at: 'run:' put: { x -> $Effect raise: #A with: $x }. #r bind: ({ 500 times: { [1, 2, 3] map: { x -> $o run: $x } } } handleWith: $h). %js(v = $r; (() => { if (v[2] !== 3) throw Error('wrong result'); })()).",
  ],
];
const programs = sources.map(([name, source]) => ({
  name,
  baseline: compileExperimentalEffects(source, "cross-engine.toss", {
    sharedDispatchTables: true,
  }),
  candidate: compileExperimentalEffects(source, "cross-engine.toss", {
    sharedDispatchTables: true,
    sharedBoundaryDelegate: true,
  }),
}));

// Run the exact same generated artifacts under each host without host-specific
// APIs inside the timed work. The parent owns compilation and correctness setup.
const runner = `
let input = "";
for await (const chunk of process.stdin) input += chunk;
const programs = JSON.parse(input);
function median(xs) { return [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]; }
function timed(f) { const start = performance.now(); f(); return performance.now() - start; }
console.log(JSON.stringify({node: process.versions.bun ? null : process.versions.node, v8: process.versions.bun ? null : process.versions.v8, bun: process.versions.bun ?? null, webkit: process.versions.webkit ?? null, platform: process.platform, arch: process.arch}));
for (const program of programs) {
  const a = new Function(program.baseline), b = new Function(program.candidate);
  for (let i = 0; i < 8; i++) { a(); b(); }
  const ratios = [], baseline = [], candidate = [];
  for (let i = 0; i < 30; i++) {
    let x, y;
    if (i % 2 === 0) { x = timed(a); y = timed(b); } else { y = timed(b); x = timed(a); }
    baseline.push(x); candidate.push(y); ratios.push(y / x);
  }
  console.log(JSON.stringify({workload: program.name, baselineMs: median(baseline), candidateMs: median(candidate), pairedRatio: median(ratios)}));
}`;

for (const executable of ["node", "bun"]) {
  const process = new Deno.Command(executable, {
    args: ["--input-type=module", "-e", runner],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = process.stdin.getWriter();
  await writer.write(new TextEncoder().encode(JSON.stringify(programs)));
  await writer.close();
  const result = await process.output();
  const decoder = new TextDecoder();
  if (!result.success) {
    throw new Error(`${executable}: ${decoder.decode(result.stderr)}`);
  }
  console.log(`${executable}\n${decoder.decode(result.stdout).trimEnd()}`);
}
