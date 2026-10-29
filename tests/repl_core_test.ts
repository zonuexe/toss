import assert from "node:assert/strict";
import { createBrowserReplSession } from "../src/repl_core.ts";

Deno.test("browser REPL core preserves bindings, local macros, errors, and reset", async () => {
  const session = createBrowserReplSession();
  assert.deepEqual(await session.submit("#value bind: 4."), {
    kind: "value",
    display: "4",
  });
  assert.deepEqual(
    await session.submit(
      "%macro(#double, { syntax -> %`((%,($syntax)) add: (%,($syntax))) }).",
    ),
    { kind: "empty" },
  );
  assert.deepEqual(await session.submit("%double($value)."), {
    kind: "value",
    display: "8",
  });

  const failedSyntax = await session.submit(
    "%macro(#uncommitted, { syntax -> %quote(9) }). 'broken' add:.",
  );
  assert.equal(failedSyntax.kind, "error");
  assert.equal((await session.submit("%uncommitted().")).kind, "error");

  const failedRuntime = await session.submit(
    "#retained bind: 'yes'. $missing.",
  );
  assert.equal(failedRuntime.kind, "error");
  assert.deepEqual(await session.submit("$retained."), {
    kind: "value",
    display: '"yes"',
  });

  await session.reset();
  assert.equal((await session.submit("$value.")).kind, "error");
  assert.equal((await session.submit("%double(3).")).kind, "error");
});

Deno.test("browser REPL core rejects file imports at their source locations", async () => {
  const session = createBrowserReplSession();
  const tossImport = await session.submit("\n%import('./module.toss').");
  assert.equal(tossImport.kind, "error");
  assert.match(tossImport.message, /<repl>:2:\d+/);
  assert.match(
    tossImport.message,
    /%import is unavailable in the browser REPL core/,
  );

  const macroImport = await session.submit("%macroImport('./macros.toss').");
  assert.equal(macroImport.kind, "error");
  assert.match(
    macroImport.message,
    /%macroImport is unavailable in the browser REPL core/,
  );

  const nestedImport = await session.submit(
    "#unused bind: { %import('./module.toss') }.",
  );
  assert.equal(nestedImport.kind, "error");
  assert.match(
    nestedImport.message,
    /%import is unavailable in the browser REPL core/,
  );
});

Deno.test("browser REPL resolves virtual module and macro imports", async () => {
  const loaded: string[] = [];
  const sources = new Map([
    ["macros.toss", "%macro(#answer, { s -> %quote(42) })."],
    [
      "dir/value.toss",
      "%macroImport('./macros.toss'). { %jsImport('fixture:nested') }. %export(%answer()).",
    ],
    ["dir/macros.toss", "%macro(#answer, { s -> %quote(41) })."],
  ]);
  const session = createBrowserReplSession({
    sources,
    loadJavaScriptModule: (specifier) => {
      loaded.push(specifier);
      return Promise.resolve({ ready: true });
    },
  });
  assert.deepEqual(
    await session.submit(
      "%macroImport('./macros.toss'). #value bind: %import('./dir/value.toss'). %answer().",
    ),
    { kind: "value", display: "42" },
  );
  assert.deepEqual(loaded, ["fixture:nested"]);
});

Deno.test("browser REPL source edits remain cached until reset", async () => {
  const outputs: string[] = [];
  const sources = new Map([
    ["value.toss", "'first source' print. %export(1)."],
    ["macros.toss", "%macro(#answer, { s -> %quote(1) })."],
  ]);
  const session = createBrowserReplSession({
    sources,
    onOutput: (value) => outputs.push(value),
  });
  assert.deepEqual(await session.submit("%import('./value.toss')."), {
    kind: "value",
    display: "1",
  });
  assert.deepEqual(await session.submit("%macroImport('./macros.toss')."), {
    kind: "empty",
  });
  sources.set("value.toss", "'edited source' print. %export(2).");
  sources.set("macros.toss", "%macro(#answer, { s -> %quote(2) }).");
  assert.deepEqual(await session.submit("%import('./value.toss')."), {
    kind: "value",
    display: "1",
  });
  assert.deepEqual(await session.submit("%answer()."), {
    kind: "value",
    display: "1",
  });
  await session.reset();
  assert.deepEqual(await session.submit("%import('./value.toss')."), {
    kind: "value",
    display: "2",
  });
  assert.deepEqual(
    await session.submit("%macroImport('./macros.toss'). %answer()."),
    {
      kind: "value",
      display: "2",
    },
  );
  assert.deepEqual(outputs, ["first source", "edited source"]);
});

Deno.test("browser REPL source map errors are positioned and recoverable", async () => {
  const sources = new Map([["main.toss", "%export(7)."]]);
  const missing = createBrowserReplSession({ sources });
  const missingResult = await missing.submit("%import('./later.toss').");
  assert.equal(missingResult.kind, "error");
  if (missingResult.kind === "error") {
    assert.match(missingResult.message, /<repl>:1:\d+/);
    assert.match(missingResult.message, /Imported file not found/);
  }
  sources.set("later.toss", "%export(8).");
  assert.deepEqual(await missing.submit("%import('./later.toss')."), {
    kind: "value",
    display: "8",
  });

  const duplicateSources = new Map([
    ["later.toss", "%export(8)."],
    ["nested/../later.toss", "%export(9)."],
  ]);
  const duplicateSession = createBrowserReplSession({
    sources: duplicateSources,
  });
  assert.deepEqual(await duplicateSession.submit("6."), {
    kind: "value",
    display: "6",
  });
  const duplicate = await duplicateSession.submit("%import('./later.toss').");
  assert.equal(duplicate.kind, "error");
  if (duplicate.kind === "error") {
    assert.match(duplicate.message, /<repl>:\d+:\d+/);
    assert.match(duplicate.message, /Duplicate source map path/);
  }
  duplicateSources.delete("nested/../later.toss");
  assert.deepEqual(await duplicateSession.submit("%import('./later.toss')."), {
    kind: "value",
    display: "8",
  });
});

Deno.test("browser REPL rejects import cycles before cell effects", async () => {
  const session = createBrowserReplSession({
    sources: new Map([
      ["a.toss", "%import('./b.toss'). %export(1)."],
      ["b.toss", "%import('./a.toss'). %export(2)."],
    ]),
  });
  const result = await session.submit(
    "'no effect' print. %import('./a.toss').",
  );
  assert.equal(result.kind, "error");
  if (result.kind === "error") {
    assert.match(result.message, /Static module dependency cycle detected/);
  }
});

Deno.test("browser REPL virtual modules compile eagerly and initialize lazily", async () => {
  const outputs: string[] = [];
  const sources = new Map([
    ["lazy.toss", "'initialized' print. %export(12)."],
  ]);
  const session = createBrowserReplSession({
    sources,
    onOutput: (value) => outputs.push(value),
  });
  assert.deepEqual(
    await session.submit("#thunk bind: { %import('./lazy.toss') }."),
    {
      kind: "value",
      display: "<block>",
    },
  );
  assert.deepEqual(outputs, []);
  sources.set("../invalid.toss", "%export(99).");
  assert.deepEqual(await session.submit("%import('./lazy.toss')."), {
    kind: "value",
    display: "12",
  });
  assert.deepEqual(outputs, ["initialized"]);
  sources.delete("../invalid.toss");
  sources.delete("lazy.toss");
  assert.deepEqual(await session.submit("%import('././lazy.toss')."), {
    kind: "value",
    display: "12",
  });
  assert.deepEqual(outputs, ["initialized"]);
  await session.reset();
  const missingAfterReset = await session.submit("%import('./lazy.toss').");
  assert.equal(missingAfterReset.kind, "error");
  if (missingAfterReset.kind === "error") {
    assert.match(missingAfterReset.message, /Imported file not found/);
  }
});

Deno.test("browser REPL retries failed module candidates without effects", async () => {
  const outputs: string[] = [];
  const sources = new Map([
    ["module.toss", "%import('./missing.toss'). %export(1)."],
  ]);
  const session = createBrowserReplSession({
    sources,
    onOutput: (value) => outputs.push(value),
  });
  const first = await session.submit(
    "'should not run' print. %import('./module.toss').",
  );
  assert.equal(first.kind, "error");
  assert.deepEqual(outputs, []);
  sources.set("missing.toss", "%export(8).");
  assert.deepEqual(await session.submit("%import('./module.toss')."), {
    kind: "value",
    display: "1",
  });
});

Deno.test("browser REPL retries module compilation after JS load failure", async () => {
  const sources = new Map([
    ["module.toss", "%jsImport('fixture:module'). %export(1)."],
  ]);
  let attempts = 0;
  const session = createBrowserReplSession({
    sources,
    loadJavaScriptModule: () => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(new Error("temporary load failure"));
      }
      return Promise.resolve({ value: 2 });
    },
  });
  assert.equal(
    (await session.submit("%import('./module.toss').")).kind,
    "error",
  );
  sources.set("module.toss", "%jsImport('fixture:module'). %export(2).");
  assert.deepEqual(await session.submit("%import('./module.toss')."), {
    kind: "value",
    display: "2",
  });
  assert.equal(attempts, 2);
});

Deno.test("browser REPL reset retains host JS namespaces across source reload", async () => {
  const sources = new Map([
    ["module.toss", "%export(%jsImport('fixture:shared'))."],
  ]);
  let loads = 0;
  const session = createBrowserReplSession({
    sources,
    loadJavaScriptModule: () => {
      loads += 1;
      return Promise.resolve({ value: 13 });
    },
  });
  const source =
    "#module bind: %import('./module.toss'). %js(module = $module; module.value).";
  assert.deepEqual(await session.submit(source), {
    kind: "value",
    display: "13",
  });
  sources.set("module.toss", "%export(%jsImport('fixture:shared')).");
  await session.reset();
  assert.deepEqual(await session.submit(source), {
    kind: "value",
    display: "13",
  });
  assert.equal(loads, 1);
});

Deno.test("browser REPL core loads JavaScript before cell effects and caches namespace identity", async () => {
  const events: string[] = [];
  const namespace = { events, value: 21 };
  let calls = 0;
  assert.equal(
    Reflect.set(globalThis, "__tossBrowserReplEvents", events),
    true,
  );
  try {
    const session = createBrowserReplSession({
      loadJavaScriptModule: (specifier) => {
        calls += 1;
        events.push(`load:${specifier}`);
        return Promise.resolve(namespace);
      },
    });
    const result = await session.submit(
      "%js(globalThis.__tossBrowserReplEvents.push('effect')). #left bind: %jsImport('fixture:host'). #right bind: %jsImport('fixture:host'). %js(a = $left, b = $right; a === b && a.value === 21).",
    );
    assert.deepEqual(result, { kind: "value", display: "true" });
    assert.deepEqual(events, ["load:fixture:host", "effect"]);
    assert.equal(calls, 1);
  } finally {
    Reflect.deleteProperty(globalThis, "__tossBrowserReplEvents");
  }
});

Deno.test("browser REPL core queues submissions and reset behind JS loading", async () => {
  let started: (() => void) | undefined;
  let release: (() => void) | undefined;
  const loadStarted = new Promise<void>((resolve) => started = resolve);
  const loadGate = new Promise<void>((resolve) => release = resolve);
  const session = createBrowserReplSession({
    loadJavaScriptModule: async () => {
      started?.();
      await loadGate;
      return {};
    },
  });
  const importing = session.submit("%jsImport('fixture:slow').");
  const following = session.submit("#later bind: 9.");
  const resetting = session.reset();
  const afterReset = session.submit("$later.");
  await loadStarted;
  release?.();
  assert.equal((await importing).kind, "value");
  assert.equal((await following).kind, "value");
  await resetting;
  assert.equal((await afterReset).kind, "error");
});

Deno.test("browser REPL core bundle has no Deno or Node builtin dependencies", async () => {
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["info", "--json", "src/repl_core.ts"],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assert.equal(result.code, 0, new TextDecoder().decode(result.stderr));
  const graph = new TextDecoder().decode(result.stdout);
  assert.doesNotMatch(graph, /"kind"\s*:\s*"node"/);
  assert.doesNotMatch(
    graph,
    /repl_host_deno\.ts|repl_modules\.ts|repl_macro_import\.ts|repl_cli\.ts/,
  );
});

Deno.test("browser REPL output sink receives print before automatic values", async () => {
  const events: string[] = [];
  const session = createBrowserReplSession({
    onOutput: (value) => events.push(`print:${value}`),
  });
  const result = await session.submit("'printed' print.");
  events.push(
    `result:${result.kind === "value" ? result.display : result.kind}`,
  );
  assert.deepEqual(events, ["print:printed", 'result:"printed"']);

  const failed = await session.submit(
    "#kept bind: 7. 'before error' print. $missing.",
  );
  assert.equal(failed.kind, "error");
  assert.deepEqual(events.slice(-1), ["print:before error"]);
  assert.deepEqual(await session.submit("$kept."), {
    kind: "value",
    display: "7",
  });
  assert.deepEqual(
    await session.submit("%js(console.log === globalThis.console.log)."),
    { kind: "value", display: "true" },
  );
});

Deno.test("browser REPL async output stays ordered after its cell completes", async () => {
  const outputs: string[] = [];
  let release: (() => void) | undefined;
  let printedLate: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => release = resolve);
  const latePrint = new Promise<void>((resolve) => printedLate = resolve);
  const session = createBrowserReplSession({
    onOutput: (value) => {
      outputs.push(value);
      if (value === "late") printedLate?.();
    },
    loadJavaScriptModule: () => Promise.resolve({ promise: gate }),
  });
  assert.deepEqual(
    await session.submit(
      "#gate bind: %jsImport('fixture:gate'). #task bind: %async({ %await(%js(gate = $gate; gate.promise)). 'late' print. 7 }). #callback bind: $task asJSCallback. %js(callback = $callback; callback()).",
    ),
    { kind: "value", display: "<js>" },
  );
  assert.deepEqual(outputs, []);
  await session.submit("'next cell' print.");
  assert.deepEqual(outputs, ["next cell"]);
  release?.();
  await latePrint;
  assert.deepEqual(outputs, ["next cell", "late"]);
});

Deno.test("browser REPL output callback failures remain positioned runtime errors", async () => {
  const session = createBrowserReplSession({
    onOutput: () => {
      throw new Error("output sink failed");
    },
  });
  const failure = await session.submit("'cannot print' print.");
  assert.equal(failure.kind, "error");
  assert.match(failure.message, /<repl>:1:\d+: RuntimeError/);
  assert.match(failure.message, /REPL output handler failed/);
  assert.match(failure.message, /caused by: output sink failed/);
  assert.deepEqual(await session.submit("5."), {
    kind: "value",
    display: "5",
  });
});
