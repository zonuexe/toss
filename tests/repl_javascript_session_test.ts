import assert from "node:assert/strict";
import { join } from "node:path";
import { createAsyncReplSession, createReplSession } from "../src/repl.ts";

function fixture(files: Readonly<Record<string, string>>): string {
  const directory = Deno.makeTempDirSync();
  for (const [name, source] of Object.entries(files)) {
    const path = join(directory, name);
    Deno.mkdirSync(join(path, ".."), { recursive: true });
    Deno.writeTextFileSync(path, source);
  }
  return directory;
}

Deno.test("async session preserves namespace identity and JS interop", async () => {
  const namespace = { default: 7, named: 11 };
  let calls = 0;
  const session = createAsyncReplSession({
    loadJavaScriptModule: () => {
      calls += 1;
      return Promise.resolve(namespace);
    },
  });
  const result = await session.submit(
    "#first bind: %jsImport('fixture:shared'). #second bind: %jsImport('fixture:shared'). %js(a = $first, b = $second; a === b && a.named + a.default).",
  );
  assert.deepEqual(result, { kind: "value", display: "18" });
  assert.equal(calls, 1);
});

Deno.test("JS imports load eagerly after compile and before cell effects", async () => {
  const order: string[] = [];
  Reflect.set(globalThis, "__tossReplImportOrder", order);
  try {
    const session = createAsyncReplSession({
      loadJavaScriptModule: () => {
        order.push("load");
        return Promise.resolve({});
      },
    });
    const result = await session.submit(
      "%js(globalThis.__tossReplImportOrder.push('effect')). { %jsImport('fixture:unused') }.",
    );
    assert.equal(result.kind, "value");
    assert.deepEqual(order, ["load", "effect"]);
  } finally {
    Reflect.deleteProperty(globalThis, "__tossReplImportOrder");
  }
});

Deno.test("Toss module dependencies register imported JS references", async () => {
  const baseDirectory = fixture({
    "dependency.toss": "%export(%jsImport('fixture:module')).",
  });
  try {
    const session = createAsyncReplSession({
      baseDirectory,
      loadJavaScriptModule: () => Promise.resolve({ value: 23 }),
    });
    assert.deepEqual(
      await session.submit(
        "#module bind: %import('./dependency.toss'). %js(module = $module; module.value).",
      ),
      { kind: "value", display: "23" },
    );
  } finally {
    Deno.removeSync(baseDirectory, { recursive: true });
  }
});

Deno.test("JS dependency loading follows root-first preorder with deduplication", async () => {
  const baseDirectory = fixture({
    "left.toss":
      "%jsImport('fixture:left'). %import('./child.toss'). %export(1).",
    "right.toss":
      "%jsImport('fixture:right'). %import('./child.toss'). %export(2).",
    "child.toss": "%jsImport('fixture:child'). %export(3).",
  });
  const loaded: string[] = [];
  try {
    const session = createAsyncReplSession({
      baseDirectory,
      loadJavaScriptModule: (specifier) => {
        loaded.push(specifier);
        return Promise.resolve({});
      },
    });
    const result = await session.submit(
      "%jsImport('fixture:root'). %jsImport('fixture:root'). #unused bind: { %import('./left.toss'). %import('./right.toss') }.",
    );
    assert.equal(result.kind, "value");
    assert.deepEqual(loaded, [
      "fixture:root",
      "fixture:left",
      "fixture:child",
      "fixture:right",
    ]);
  } finally {
    Deno.removeSync(baseDirectory, { recursive: true });
  }
});

Deno.test("host imports resolve node built-ins and configured package aliases", async () => {
  const session = createAsyncReplSession();
  const result = await session.submit(
    "#path bind: %jsImport('node:path'). #hono bind: %jsImport('hono'). %js(path = $path, hono = $hono; path.basename('/tmp/value.txt') + ':' + typeof hono.Hono).",
  );
  assert.deepEqual(result, { kind: "value", display: '"value.txt:function"' });
});

Deno.test("macro expansion contributes JS imports to eager loading", async () => {
  const loaded: string[] = [];
  const session = createAsyncReplSession({
    loadJavaScriptModule: (specifier) => {
      loaded.push(specifier);
      return Promise.resolve({ ready: true });
    },
  });
  const result = await session.submit(
    "%macro(#host, { syntax -> %quote(%jsImport('fixture:macro')) }). #namespace bind: %host().",
  );
  assert.equal(result.kind, "value");
  assert.deepEqual(loaded, ["fixture:macro"]);
});

Deno.test("compile errors call no loader and load failures roll back candidates", async () => {
  let calls = 0;
  let fails = true;
  const session = createAsyncReplSession({
    loadJavaScriptModule: () => {
      calls += 1;
      if (fails) return Promise.reject(17);
      return Promise.resolve({ ok: true });
    },
  });
  const invalid = await session.submit(
    "%js(globalThis.__tossBeforeImport = true). %jsImport('fixture:retry'). 'bad' add:.",
  );
  assert.equal(invalid.kind, "error");
  assert.equal(calls, 0);
  const failed = await session.submit(
    "%macro(#candidate, { syntax -> %quote(1) }). %jsImport('fixture:retry').",
  );
  assert.equal(failed.kind, "error");
  assert.match(failed.message, /fixture:retry.*17/);
  assert.match(failed.message, /<repl>:\d+:\d+/);
  const absent = await session.submit("%candidate().");
  assert.equal(absent.kind, "error");
  fails = false;
  assert.equal(
    (await session.submit("%jsImport('fixture:retry').")).kind,
    "value",
  );
  assert.equal(calls, 2);
});

Deno.test("host rejection formatting survives throwing proxies and coercion", async () => {
  let coercions = 0;
  const rejection = {
    [Symbol.toPrimitive]: () => {
      coercions += 1;
      throw new Error("host coercion must not run");
    },
  };
  const session = createAsyncReplSession({
    loadJavaScriptModule: () => Promise.reject(rejection),
  });
  const failure = await session.submit("%jsImport('fixture:bad-object').");
  assert.equal(failure.kind, "error");
  assert.match(failure.message, /fixture:bad-object/);
  assert.match(failure.message, /non-Error object rejection/);
  assert.equal(coercions, 0);
  assert.deepEqual(await session.submit("7."), {
    kind: "value",
    display: "7",
  });
});

Deno.test("reset reuses host namespaces and clears Toss values", async () => {
  let calls = 0;
  const session = createAsyncReplSession({
    loadJavaScriptModule: () => {
      calls += 1;
      return Promise.resolve({ value: 5 });
    },
  });
  await session.submit("#host bind: %jsImport('fixture:cached').");
  await session.reset();
  const result = await session.submit(
    "#host bind: %jsImport('fixture:cached'). %js(host = $host; host.value).",
  );
  assert.deepEqual(result, { kind: "value", display: "5" });
  assert.equal(calls, 1);
});

Deno.test("async submissions and reset run in call order", async () => {
  let startLoading: (() => void) | undefined;
  let releaseLoading: (() => void) | undefined;
  const started = new Promise<void>((resolve) => startLoading = resolve);
  const gate = new Promise<void>((resolve) => releaseLoading = resolve);
  const events: string[] = [];
  const session = createAsyncReplSession({
    loadJavaScriptModule: async () => {
      events.push("load-start");
      startLoading?.();
      await gate;
      events.push("load-end");
      return {};
    },
  });
  const importing = session.submit("%jsImport('fixture:slow').");
  const following = session.submit("#later bind: 9.");
  const resetting = session.reset();
  const afterReset = session.submit("$later.");
  await started;
  assert.deepEqual(events, ["load-start"]);
  releaseLoading?.();
  await importing;
  assert.equal((await following).kind, "value");
  await resetting;
  assert.equal((await afterReset).kind, "error");
  assert.deepEqual(events, ["load-start", "load-end"]);
});

Deno.test("sync session rejects JS imports with a positioned diagnostic", () => {
  const result = createReplSession().submit("\n%jsImport('fixture:sync').");
  assert.equal(result.kind, "error");
  assert.match(result.message, /<repl>:2:\d+/);
});
