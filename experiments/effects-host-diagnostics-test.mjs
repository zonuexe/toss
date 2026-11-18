import assert from "node:assert/strict";
import {
  compileExperimentalEffects,
  compileExperimentalEffectsSources,
} from "./effects-compiler.ts";
import { generateExperimentalEffectsRuntime } from "./effects-external-runtime.ts";
import { createExperimentalEffectsRepl } from "./effects-repl.ts";

const moduleUrl = (source) => `data:text/javascript;base64,${btoa(source)}`;
const failureObserverImport = moduleUrl(`
  export function onEffectFailure(diagnostic) {
    globalThis.diagnostics.push(diagnostic);
    globalThis.reenter?.();
    if (diagnostic.boundary === "promise") return Promise.reject(new Error("async observer failed"));
    throw new Error("observer failed");
  }
`);
const base = { failureCarriers: true, failureObserverImport };
const runtimeImport = moduleUrl(generateExperimentalEffectsRuntime(base));
const sources = new Map([
  [
    "main.toss",
    `
    #outer bind: { { %import('./lib.toss') } ensure: { $outerCleanup } } asJSCallback.
    #inner bind: { { %import('./lib.toss') } ensure: { $innerCleanup } } asJSCallback.
    #async bind: %async({ x -> %await(%js(Promise.resolve())).
      { %import('./lib.toss') } ensure: {
        (%js(n = $x; n === 1)) ifTrue: { $firstCleanup } ifFalse: { $secondCleanup }
      }
    }) asJSCallback.
    %js(o = $outer, i = $inner, a = $async; (() => {
      globalThis.diagnostics = [];
      let innerError;
      globalThis.reenter = () => {
        delete globalThis.reenter;
        try { i(); } catch (error) { innerError = error; }
      };
      let outerError;
      try { o(); } catch (error) { outerError = error; }
      Object.freeze(outerError);
      return Promise.allSettled([a(1), a(2)]).then(([first, second]) => {
        const reports = globalThis.diagnostics;
        console.log(JSON.stringify({
          sameError: outerError === innerError && first.reason === outerError &&
            second.reason === outerError && reports.every(d => d.error === outerError),
          immutable: reports.every(d => Object.isFrozen(d) &&
            Object.isFrozen(d.cleanupDescriptions) && Object.isFrozen(d.handlerDescriptions)),
          stackUnchanged: !outerError.stack.includes("cleanup failure"),
          callbacks: reports.slice(0, 2).map(d => d.boundary),
          promises: reports.slice(2).map(d => d.boundary),
          cleanup: reports.map(d => d.cleanupDescriptions.map(s => s.match(/"([A-Za-z]+)"/)?.[1])),
        }));
      });
    })()).
  `,
  ],
  ["lib.toss", "%export({ $missing } ensure: { $moduleCleanup })."],
]);

async function execute(source) {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["eval", source],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  assert.equal(result.success, true, decoder.decode(result.stderr));
  return decoder.decode(result.stdout);
}

for (const options of [base, { ...base, runtimeImport }]) {
  const program = compileExperimentalEffectsSources(
    "main.toss",
    sources,
    options,
  );
  const report = JSON.parse(await execute(program));
  assert.equal(report.sameError, true);
  assert.equal(report.immutable, true);
  assert.equal(report.stackUnchanged, true);
  assert.deepEqual(report.callbacks, ["callback", "callback"]);
  assert.deepEqual(report.promises, ["promise", "promise"]);
  assert.deepEqual(report.cleanup.slice(0, 2), [
    ["moduleCleanup", "outerCleanup"],
    ["moduleCleanup", "innerCleanup"],
  ]);
  assert.deepEqual(report.cleanup.slice(2).sort(), [
    ["moduleCleanup", "firstCleanup"],
    ["moduleCleanup", "secondCleanup"],
  ]);
}

const late = compileExperimentalEffects(
  `
  #f bind: %async({ { $missing } ensure: { $cleanup } }).
  #result bind: ($f value).
  #observe bind: { %js(p = $result; p.catch(e => console.log(
    e === globalThis.lateError, globalThis.diagnostics.length,
    globalThis.diagnostics[0].boundary))) } asJSCallback.
  %js(f = $observe; (globalThis.diagnostics = [], addEventListener('unhandledrejection', e => {
    e.preventDefault();
    globalThis.lateError = e.reason;
    f();
  }, { once: true }), 0)).
`,
  "late.toss",
  base,
);
assert.equal(await execute(late), "true 1 unobserved-async\n");

for (const options of [base, { ...base, runtimeImport }]) {
  const program = compileExperimentalEffects(
    "{ $missing } ensure: { $cleanup }.",
    "entry.toss",
    options,
  );
  const imports = program.match(/^(?:import \* as [^\n]+\n)+/)?.[0] ?? "";
  const observed = await execute(`
    ${imports}
    globalThis.diagnostics = [];
    try { ${program.slice(imports.length)} }
    catch (error) {
      const [report] = globalThis.diagnostics;
      console.log(report.boundary, report.error === error, report.cleanupDescriptions[0].includes("cleanup"));
    }
  `);
  assert.equal(observed, "entry true true\n");
}

const diagnostics = [];
const repl = createExperimentalEffectsRepl(() => {}, {
  onEffectFailure: (diagnostic) => diagnostics.push(diagnostic),
});
const result = repl.evaluate("{ $missing } ensure: { $cleanup }.", "repl.toss");
assert.equal(result.kind, "error");
assert.equal(diagnostics[0].boundary, "repl");
assert.equal(diagnostics[0].error, result.error);
assert.match(diagnostics[0].cleanupDescriptions[0], /cleanup/);
console.log(
  "PASS: host diagnostics isolate re-entry, parallel and late async observations",
);
