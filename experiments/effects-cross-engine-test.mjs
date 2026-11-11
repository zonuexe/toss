import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import {
  compileExperimentalEffects,
  compileExperimentalEffectsSources,
} from "./effects-compiler.ts";
import { generateExperimentalEffectsRuntime } from "./effects-external-runtime.ts";

const cases = [
  {
    name: "reentrant callback resumes outer handler",
    source:
      "#cb bind: { #h bind: $Object clone. $h at: #Inner put: { p, k -> $k value: 7 }. { $Effect raise: #Inner with: $Nil } handleWith: $h } asJSCallback. #outer bind: $Object clone. $outer at: #Outer put: { p, k -> #v bind: %js(f = $cb; f()). $k value: $v }. ({ $Effect raise: #Outer with: $Nil } handleWith: $outer) print.",
    stdout: "7\n",
  },
  {
    name: "concurrent async handlers",
    source:
      "#work bind: %async({ x -> %await(%js(Promise.resolve())). #h bind: $Object clone. $h at: #A put: { p, k -> $k value: $p }. { $Effect raise: #A with: $x } handleWith: $h }) asJSCallback. %js(f = $work; Promise.all([f(1), f(2)]).then(v => console.log(v.join(',')))).",
    stdout: "1,2\n",
  },
  {
    name: "abandonment cleanup",
    source:
      "#h bind: $Object clone. $h at: #A put: { p, k -> 42 }. ({ { $Effect raise: #A with: $Nil. 'never' print } ensure: { 'cleanup' print } } handleWith: $h) print.",
    stdout: "cleanup\n42\n",
  },
  {
    name: "reentrant cached failure preserves cleanup",
    sources: new Map([
      [
        "main.toss",
        "#b bind: { %import('./lib.toss') } asJSCallback. #a bind: { { { %import('./lib.toss') } ensure: { $innerCleanup } } ensure: { %js(f = $b; (() => { try { f(); } catch (e) {} })()) } } asJSCallback. %js(f = $a; (() => { try { f(); } catch (e) { console.log(e.stack.includes('innerCleanup')); } })()).",
      ],
      ["lib.toss", "%export($missing)."],
    ]),
    stdout: "true\n",
  },
];
const decoder = new TextDecoder();
const directory = await Deno.makeTempDir({ prefix: "toss-effects-runtime-" });
try {
  for (const sharedBoundaryDelegate of [false, true]) {
    const path = `${directory}/runtime-${sharedBoundaryDelegate}.mjs`;
    await Deno.writeTextFile(
      path,
      generateExperimentalEffectsRuntime({
        sharedDispatchTables: true,
        sharedBoundaryDelegate,
      }),
    );
  }
  for (const engine of ["node", "bun"]) {
    for (const scenario of cases) {
      for (const sharedBoundaryDelegate of [false, true]) {
        const base = { sharedDispatchTables: true, sharedBoundaryDelegate };
        for (const external of [false, true]) {
          const runtimeImport =
            pathToFileURL(`${directory}/runtime-${sharedBoundaryDelegate}.mjs`)
              .href;
          const options = external ? { ...base, runtimeImport } : base;
          const javascript = scenario.sources
            ? compileExperimentalEffectsSources(
              "main.toss",
              scenario.sources,
              options,
            )
            : compileExperimentalEffects(
              scenario.source,
              "cross-engine.toss",
              options,
            );
          const result = await new Deno.Command(engine, {
            args: ["--input-type=module", "-e", javascript],
            stdout: "piped",
            stderr: "piped",
          }).output();
          const label =
            `${engine}: ${scenario.name}, delegate=${sharedBoundaryDelegate}, external=${external}`;
          assert.equal(
            result.success,
            true,
            `${label}: ${decoder.decode(result.stderr)}`,
          );
          assert.equal(decoder.decode(result.stdout), scenario.stdout, label);
        }
      }
    }
    console.log(
      `PASS: ${engine} preserves re-entry, async and cleanup with embedded and external delegates`,
    );
  }
} finally {
  await Deno.remove(directory, { recursive: true });
}
