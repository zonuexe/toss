import assert from "node:assert/strict";
import {
  compileExperimentalEffects,
  compileExperimentalEffectsSources,
} from "./effects-compiler.ts";
import { generateExperimentalEffectsRuntime } from "./effects-external-runtime.ts";
import { createExperimentalEffectsRepl } from "./effects-repl.ts";

const base = {
  sharedDispatchTables: true,
  sharedBoundaryDelegate: true,
  failureCarriers: true,
};
const runtimeImport = `data:text/javascript;base64,${
  btoa(generateExperimentalEffectsRuntime(base))
}`;
async function execute(code) {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["eval", code],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  return {
    success: result.success,
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
  };
}
const cases = [
  [
    "resumption and cleanup",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. ({ { $Effect raise: #A with: $Nil } ensure: { 'cleanup' print } } handleWith: $h) print.",
    "cleanup\n7\n",
  ],
  [
    "abandonment cleanup",
    "#h bind: $Object clone. $h at: #A put: { p, k -> 42 }. ({ { $Effect raise: #A with: $Nil. 'never' print } ensure: { 'cleanup' print } } handleWith: $h) print.",
    "cleanup\n42\n",
  ],
  [
    "async local handler",
    "#f bind: %async({ %await(%js(Promise.resolve())). #h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. { $Effect raise: #A with: $Nil } handleWith: $h }) asJSCallback. %js(f = $f; f().then(v => console.log(v))).",
    "7\n",
  ],
  [
    "async rejection identity",
    "#f bind: %async({ %await(%js(Promise.reject(globalThis.sharedCarrierError))) }) asJSCallback. %js(f = $f; f().catch(e => console.log(e.cause === globalThis.sharedCarrierError))).",
    "true\n",
  ],
];
for (const [name, source, expected] of cases) {
  for (const external of [false, true]) {
    const code = compileExperimentalEffects(source, "carrier.toss", {
      ...base,
      ...(external ? { runtimeImport } : {}),
    });
    const result = await execute(
      `globalThis.sharedCarrierError = new Error('host');\n${code}`,
    );
    assert.equal(
      result.success,
      true,
      `${name} external=${external}: ${result.stderr}`,
    );
    assert.equal(result.stdout, expected, name);
  }
}
const asyncChain =
  "#inner bind: %async({ { $missing } ensure: { $cleanup } }). #outer bind: %async({ %await($inner value) }) asJSCallback. %js(f = $outer; f().catch(e => console.log('HOST', e instanceof Error, e.stack.includes('cleanup')))).";
const asyncChainCode = compileExperimentalEffects(
  asyncChain,
  "async-chain.toss",
  base,
);
const asyncCatch = "catch (error) { throwAsyncEffectFailure(error); }";
assert.equal(asyncChainCode.split(asyncCatch).length - 1, 2);
const inspectedChain = asyncChainCode.replaceAll(
  asyncCatch,
  "catch (error) { console.log('CARRIER', isEffectCarrier(error)); throwAsyncEffectFailure(error); }",
);
const chainResult = await execute(inspectedChain);
assert.equal(chainResult.success, true, chainResult.stderr);
assert.equal(
  chainResult.stdout,
  "CARRIER true\nCARRIER true\nHOST true true\n",
);
const externalChain = await execute(
  compileExperimentalEffects(asyncChain, "async-chain.toss", {
    ...base,
    runtimeImport,
  }),
);
assert.equal(externalChain.success, true, externalChain.stderr);
assert.equal(externalChain.stdout, "HOST true true\n");
const guardedChain =
  "globalThis.carrierUnhandled = 0; globalThis.addEventListener('unhandledrejection', e => { globalThis.carrierUnhandled++; e.preventDefault(); }); setTimeout(() => console.log('UNHANDLED', globalThis.carrierUnhandled), 20);\n" +
  compileExperimentalEffects(asyncChain, "async-chain.toss", base);
const guardedResult = await execute(guardedChain);
assert.equal(guardedResult.success, true, guardedResult.stderr);
assert.equal(guardedResult.stdout, "HOST true true\nUNHANDLED 0\n");
const foreignSource =
  "#f bind: %async({ %await(%js(Promise.reject(globalThis.carrierForeign))) }) asJSCallback. %js(f = $f; f().catch(e => console.log(e.cause === globalThis.carrierForeign, globalThis.carrierReads))).";
for (
  const setup of [
    "globalThis.carrierReads = 0; globalThis.carrierForeign = undefined;",
    "globalThis.carrierReads = 0; globalThis.carrierForeign = new Proxy({}, { get() { globalThis.carrierReads++; throw 1; }, getPrototypeOf() { globalThis.carrierReads++; throw 2; } });",
  ]
) {
  for (const external of [false, true]) {
    const result = await execute(
      setup + "\n" +
        compileExperimentalEffects(foreignSource, "foreign.toss", {
          ...base,
          ...(external ? { runtimeImport } : {}),
        }),
    );
    assert.equal(result.success, true, result.stderr);
    assert.equal(result.stdout, "true 0\n");
  }
}
const unhandledAsync =
  "%js((globalThis.addEventListener('unhandledrejection', e => { console.log('UNHANDLED', e.reason instanceof Error, e.reason.message.includes('missing'), e.reason.stack.includes('cleanup')); e.preventDefault(); }), 0)). #f bind: %async({ { $missing } ensure: { $cleanup } }). $f value.";
for (const external of [false, true]) {
  const result = await execute(
    compileExperimentalEffects(unhandledAsync, "unhandled.toss", {
      ...base,
      ...(external ? { runtimeImport } : {}),
    }),
  );
  assert.equal(result.success, true, result.stderr);
  assert.equal(result.stdout, "UNHANDLED true true true\n");
}
const modules = new Map([
  [
    "main.toss",
    "#a bind: { { %import('./lib.toss') } ensure: { $firstCleanup } } asJSCallback. #b bind: { { %import('./lib.toss') } ensure: { $secondCleanup } } asJSCallback. %js(a = $a, b = $b; (() => { let first; try { a(); } catch (e) { first = e; console.log('FIRST', e.stack.includes('firstCleanup')); } try { b(); } catch (e) { console.log('SAME', e === first); console.log('SECOND', e.stack.includes('secondCleanup'), e.stack.includes('firstCleanup')); } })()).",
  ],
  ["lib.toss", "%export($missing)."],
]);
for (const external of [false, true]) {
  const result = await execute(
    compileExperimentalEffectsSources("main.toss", modules, {
      ...base,
      ...(external ? { runtimeImport } : {}),
    }),
  );
  assert.equal(result.success, true, result.stderr);
  assert.equal(result.stdout, "FIRST true\nSAME true\nSECOND true false\n");
}
const cleanRetry = new Map([
  [
    "main.toss",
    "#a bind: { { %import('./lib.toss') } ensure: { $firstCleanup } } asJSCallback. #b bind: { %import('./lib.toss') } asJSCallback. %js(a = $a, b = $b; (() => { let first; try { a(); } catch (e) { first = e; } try { b(); } catch (e) { console.log(e === first, e.stack.includes('firstCleanup')); } })()).",
  ],
  ["lib.toss", "%export($missing)."],
]);
for (const external of [false, true]) {
  const result = await execute(
    compileExperimentalEffectsSources("main.toss", cleanRetry, {
      ...base,
      ...(external ? { runtimeImport } : {}),
    }),
  );
  assert.equal(result.success, true, result.stderr);
  assert.equal(result.stdout, "true false\n");
}
const parallel = new Map([
  [
    "main.toss",
    "#f bind: %async({ x -> %await(%js(Promise.resolve())). { %import('./lib.toss') } ensure: { (%js(n = $x; n === 1)) ifTrue: { $firstCleanup } ifFalse: { $secondCleanup } } }) asJSCallback. %js(f = $f; Promise.allSettled([f(1), f(2)]).then(v => console.log('SAME', v[0].reason === v[1].reason, globalThis.carrierDiagnostics.sort().join('|')))).",
  ],
  ["lib.toss", "%export($missing)."],
]);
const parallelCode = compileExperimentalEffectsSources(
  "main.toss",
  parallel,
  base,
);
assert.equal(parallelCode.split(asyncCatch).length - 1, 1);
const inspectedParallel = parallelCode.replace(
  asyncCatch,
  "catch (error) { globalThis.carrierDiagnostics.push(getEffectFailureDetails(error).cleanupDescriptions.join(',')); throwAsyncEffectFailure(error); }",
);
const parallelResult = await execute(
  "globalThis.carrierDiagnostics = [];\n" + inspectedParallel,
);
assert.equal(parallelResult.success, true, parallelResult.stderr);
assert.match(
  parallelResult.stdout,
  /SAME true .*firstCleanup.*\|.*secondCleanup/,
);
const reentrant = new Map([
  [
    "main.toss",
    "#b bind: { { %import('./lib.toss') } ensure: { $innerCleanup } } asJSCallback. #a bind: { { %import('./lib.toss') } ensure: { %js(f = $b; (() => { try { f(); } catch (e) { globalThis.savedCarrierError = e; console.log('INNER', e.stack.includes('innerCleanup'), e.stack.includes('outerCleanup')); } })()). $outerCleanup } } asJSCallback. %js(f = $a; (() => { try { f(); } catch (e) { console.log('OUTER', e === globalThis.savedCarrierError, e.stack.includes('outerCleanup'), e.stack.includes('innerCleanup')); } })()).",
  ],
  ["lib.toss", "%export($missing)."],
]);
for (const external of [false, true]) {
  const result = await execute(
    compileExperimentalEffectsSources("main.toss", reentrant, {
      ...base,
      ...(external ? { runtimeImport } : {}),
    }),
  );
  assert.equal(result.success, true, result.stderr);
  assert.equal(result.stdout, "INNER true false\nOUTER true true false\n");
}
const abandoned = new Map([
  [
    "main.toss",
    "#h bind: $Object clone. $h at: #A put: { p, k -> 42 }. #a bind: { { %import('./lib.toss') } handleWith: $h } asJSCallback. #b bind: { %import('./lib.toss') } asJSCallback. %js(a = $a, b = $b; (() => { try { a(); } catch (e) { console.log('FIRST', e.message.includes('cleanup')); } try { b(); } catch (e) { console.log('SECOND', e.message.includes('interrupted'), e.stack.includes('cleanup')); } })()).",
  ],
  [
    "lib.toss",
    "%export({ $Effect raise: #A with: $Nil } ensure: { $cleanup }).",
  ],
]);
for (const external of [false, true]) {
  const result = await execute(
    compileExperimentalEffectsSources("main.toss", abandoned, {
      ...base,
      ...(external ? { runtimeImport } : {}),
    }),
  );
  assert.equal(result.success, true, result.stderr);
  assert.equal(result.stdout, "FIRST true\nSECOND true true\n");
}
const outputs = [];
const repl = createExperimentalEffectsRepl((text) => outputs.push(text), {
  failureCarriers: true,
});
const failure = repl.evaluate(
  "{ $missing } ensure: { $cleanup }.",
  "carrier-repl.toss",
);
assert.equal(failure.kind, "error");
assert.match(failure.error.message, /missing/);
assert.match(failure.details.cleanupDescriptions[0], /cleanup/);
assert.equal(failure.details.error, failure.error);
assert.equal(repl.evaluate("'after' print.", "after.toss").kind, "value");
assert.deepEqual(outputs, ["after"]);
console.log(
  "PASS: carrier prototype preserves effects, cleanup, module identity, async and REPL boundaries",
);
