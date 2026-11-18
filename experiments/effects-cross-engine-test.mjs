import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import {
  compileExperimentalEffects,
  compileExperimentalEffectsSources,
} from "./effects-compiler.ts";
import { generateExperimentalEffectsRuntime } from "./effects-external-runtime.ts";

const cases = [
  {
    name: "fulfilled Promise callback ordering",
    source:
      "#f bind: %async({ 1 }) asJSCallback. %js(f = $f; (f().then(() => console.log('result')), Promise.resolve().then(() => console.log('tick1')).then(() => console.log('tick2')).then(() => console.log('tick3')), 0)).",
  },
  {
    name: "rejected Promise callback ordering",
    source:
      "#f bind: %async({ $missing }) asJSCallback. %js(f = $f; (f().catch(() => console.log('rejected')), Promise.resolve().then(() => console.log('tick1')).then(() => console.log('tick2')).then(() => console.log('tick3')), 0)).",
  },
  {
    name: "nested async await ordering",
    source:
      "#inner bind: %async({ 1 }). #outer bind: %async({ %await($inner value). 'inner' print }) asJSCallback. %js(f = $outer; (f().then(() => console.log('result')), Promise.resolve().then(() => console.log('tick1')).then(() => console.log('tick2')).then(() => console.log('tick3')), 0)).",
  },
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
    name: "nested async failure preserves cleanup",
    source:
      "#inner bind: %async({ { $missing } ensure: { $cleanup } }). #outer bind: %async({ %await($inner value) }) asJSCallback. %js(f = $outer; f().catch(e => console.log('HOST', e instanceof Error, e.stack.includes('cleanup')))).",
    stdout: "HOST true true\n",
  },
  {
    name: "abandonment cleanup",
    source:
      "#h bind: $Object clone. $h at: #A put: { p, k -> 42 }. ({ { $Effect raise: #A with: $Nil. 'never' print } ensure: { 'cleanup' print } } handleWith: $h) print.",
    stdout: "cleanup\n42\n",
  },
  {
    name: "unhandled async failure exposes original Error",
    source:
      "%js((process.on('unhandledRejection', e => console.log('UNHANDLED', e instanceof Error, e.message.includes('missing'))), 0)). #f bind: %async({ $missing }). $f value.",
    stdout: "UNHANDLED true true\n",
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
  {
    name: "nested cached failure excludes later caller cleanup",
    sources: new Map([
      [
        "main.toss",
        "#a bind: { %import('./outer.toss') } asJSCallback. #b bind: { { %import('./inner.toss') } ensure: { $callerCleanup } } asJSCallback. %js(a = $a, b = $b; (() => { try { a(); } catch (e) {} try { b(); } catch (e) {} try { a(); } catch (e) { console.log(e.stack.includes('outerMissing'), e.stack.includes('innerMissing'), e.stack.includes('callerCleanup')); } })()).",
      ],
      [
        "outer.toss",
        "%export({ $outerMissing } ensure: { %import('./inner.toss') }).",
      ],
      ["inner.toss", "%export($innerMissing)."],
    ]),
    stdout: "true true false\n",
  },
];
const decoder = new TextDecoder();
const directory = await Deno.makeTempDir({ prefix: "toss-effects-runtime-" });
const variants = [
  {
    sharedDispatchTables: true,
    sharedBoundaryDelegate: false,
    failureCarriers: false,
  },
  {
    sharedDispatchTables: true,
    sharedBoundaryDelegate: true,
    failureCarriers: false,
  },
  {
    sharedDispatchTables: true,
    sharedBoundaryDelegate: true,
    failureCarriers: true,
  },
];
try {
  const observerPath = `${directory}/observer.mjs`;
  await Deno.writeTextFile(
    observerPath,
    `
    export function onEffectFailure(report) {
      console.log(report.boundary, report.cleanupDescriptions[0].includes('cleanup'));
      globalThis.observedError = report.error;
    }
  `,
  );
  for (const [index, variant] of variants.entries()) {
    const path = `${directory}/runtime-${index}.mjs`;
    await Deno.writeTextFile(
      path,
      generateExperimentalEffectsRuntime(variant),
    );
  }
  for (const engine of ["node", "bun"]) {
    const diagnosticProgram = compileExperimentalEffects(
      "#f bind: %async({ { $missing } ensure: { $cleanup } }) asJSCallback. %js(f = $f; f().catch(e => console.log(e === globalThis.observedError))).",
      "host-diagnostic.toss",
      {
        ...variants[2],
        failureObserverImport: pathToFileURL(observerPath).href,
        runtimeImport: pathToFileURL(`${directory}/runtime-2.mjs`).href,
      },
    );
    const diagnosticResult = await new Deno.Command(engine, {
      args: ["--input-type=module", "-e", diagnosticProgram],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(
      diagnosticResult.success,
      true,
      decoder.decode(diagnosticResult.stderr),
    );
    assert.equal(
      decoder.decode(diagnosticResult.stdout),
      "promise true\ntrue\n",
      engine,
    );
    for (const scenario of cases) {
      let expected = scenario.stdout;
      for (const [index, base] of variants.entries()) {
        for (const external of [false, true]) {
          const runtimeImport =
            pathToFileURL(`${directory}/runtime-${index}.mjs`)
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
            `${engine}: ${scenario.name}, variant=${index}, external=${external}`;
          assert.equal(
            result.success,
            true,
            `${label}: ${decoder.decode(result.stderr)}`,
          );
          const stdout = decoder.decode(result.stdout);
          if (expected === undefined) expected = stdout;
          assert.equal(stdout, expected, label);
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
