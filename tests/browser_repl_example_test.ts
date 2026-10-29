import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { buildBrowserReplExample } from "../examples/browser-repl/build.ts";
import { createBrowserReplHandler } from "../examples/browser-repl/server.ts";
import { createBrowserReplSession } from "../src/repl_core.ts";

type FakeEvent = {
  readonly data?: unknown;
  readonly message?: string;
};

type FakeListener = (event: FakeEvent) => void;

class FakeWorker {
  readonly listeners = new Map<string, Set<FakeListener>>();
  readonly messages: unknown[] = [];
  terminated = false;
  failPost = false;

  addEventListener(name: string, listener: FakeListener): void {
    const listeners = this.listeners.get(name) ?? new Set<FakeListener>();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  postMessage(message: unknown): void {
    if (this.failPost) throw new Error("Worker unavailable");
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(name: string, event: FakeEvent = {}): void {
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }
}

function field(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected a message object.");
  }
  return Reflect.get(value, name);
}

Deno.test("browser REPL build serves separate page and Worker CSP policies", async () => {
  const outputDirectory = await Deno.makeTempDir({
    prefix: "toss-browser-repl-",
  });
  try {
    await buildBrowserReplExample(outputDirectory);
    const handle = createBrowserReplHandler(outputDirectory);
    const page = await handle(new Request("http://localhost/"));
    const worker = await handle(new Request("http://localhost/worker.js"));
    const core = await handle(new Request("http://localhost/repl-core.js"));
    const client = await handle(
      new Request("http://localhost/worker-client.js"),
    );
    const sourceList = await handle(
      new Request("http://localhost/source-list.js"),
    );
    const demoModule = await handle(
      new Request("http://localhost/demo-module.js"),
    );
    const unknown = await handle(new Request("http://localhost/source.toss"));
    const pageSource = await page.text();
    assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
    assert.match(pageSource, /%import\('\.\/math\.toss'\)/);
    assert.match(pageSource, /%macroImport\('\.\/macros\.toss'\)/);
    assert.match(pageSource, /id="demo-import-example"/);
    assert.match(pageSource, /id="virtual-sources"/);
    assert.match(pageSource, /id="add-source"/);
    const app = await handle(new Request("http://localhost/app.js"));
    assert.match(await app.text(), /window\.location\.origin/);
    assert.equal(
      page.headers.get("content-security-policy"),
      "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'",
    );
    assert.equal(
      worker.headers.get("content-security-policy"),
      "default-src 'self'; script-src 'self' 'unsafe-eval'; connect-src 'none'; object-src 'none'; base-uri 'none'",
    );
    const workerSource = await worker.text();
    assert.match(workerSource, /math\.toss/);
    assert.match(workerSource, /macros\.toss/);
    assert.equal(
      worker.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assert.equal(
      core.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assert.equal(
      client.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assert.equal(
      sourceList.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assert.equal(
      demoModule.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assert.match(await demoModule.text(), /export const answer = 42/);
    assert.equal(unknown.status, 404);
  } finally {
    await Deno.remove(outputDirectory, { recursive: true });
  }
});

Deno.test("browser REPL accepts an absolute URL to its served JS fixture", async () => {
  const fixture = new URL(
    "../examples/browser-repl/demo-module.js",
    import.meta.url,
  ).href;
  let loaderCalls = 0;
  const printed: string[] = [];
  const session = createBrowserReplSession({
    onOutput: (value) => printed.push(value),
    loadJavaScriptModule: async (specifier) => {
      loaderCalls += 1;
      return await import(specifier);
    },
  });
  const source = (specifier: string) =>
    `#demo bind: %jsImport('${specifier}'). %js(module = $demo; module.answer) print.`;
  assert.deepEqual(await session.submit(source(fixture)), {
    kind: "value",
    display: "42",
  });
  await session.reset();
  assert.deepEqual(await session.submit(source(fixture)), {
    kind: "value",
    display: "42",
  });
  assert.equal(loaderCalls, 1);

  const replacementSession = createBrowserReplSession({
    onOutput: (value) => printed.push(value),
    loadJavaScriptModule: async (specifier) => {
      loaderCalls += 1;
      return await import(specifier);
    },
  });
  assert.deepEqual(await replacementSession.submit(source(fixture)), {
    kind: "value",
    display: "42",
  });
  assert.equal(loaderCalls, 2);
  assert.deepEqual(printed, ["42", "42", "42"]);
});

Deno.test("browser REPL source editor rejects invalid and normalized duplicate paths", async () => {
  const outputDirectory = await Deno.makeTempDir({
    prefix: "toss-browser-repl-sources-",
  });
  try {
    await buildBrowserReplExample(outputDirectory);
    const sourceListUrl = pathToFileURL(
      `${outputDirectory}/source-list.js`,
    ).href;
    const sourceList: unknown = await import(sourceListUrl);
    assert.ok(typeof sourceList === "object" && sourceList !== null);
    const validate: unknown = Reflect.get(
      sourceList,
      "validateVirtualSourceEntries",
    );
    assert.equal(typeof validate, "function");
    if (typeof validate !== "function") {
      throw new Error("Source path validation is missing.");
    }
    assert.deepEqual(
      validate([["math.toss", "1."], ["nested/../math.toss", "2."]]),
      {
        ok: false,
        message: "More than one editor uses the virtual path math.toss.",
      },
    );
    assert.deepEqual(validate([["../outside.toss", "1."]]), {
      ok: false,
      message: "Virtual path escapes the source root.",
    });
    assert.deepEqual(validate([["nested/new.toss", "1."]]), { ok: true });
  } finally {
    await Deno.remove(outputDirectory, { recursive: true });
  }
});

Deno.test("browser REPL Worker client drops old messages on restart and recovers", async () => {
  const outputDirectory = await Deno.makeTempDir({
    prefix: "toss-browser-repl-client-",
  });
  const workers: FakeWorker[] = [];
  const pendingStates: boolean[] = [];
  const pendingOperations: string[] = [];
  const readyStates: boolean[] = [];
  const outputs: string[] = [];
  const completed: string[] = [];
  const failures: string[] = [];
  type PageEventListener = (event: { persisted?: boolean }) => void;
  const pageListeners = new Map<string, Set<PageEventListener>>();
  const page = {
    addEventListener(name: string, listener: PageEventListener): void {
      const listeners = pageListeners.get(name) ?? new Set<PageEventListener>();
      listeners.add(listener);
      pageListeners.set(name, listeners);
    },
  };
  const emitPage = (
    name: string,
    event: { persisted?: boolean } = {},
  ): void => {
    for (const listener of pageListeners.get(name) ?? []) listener(event);
  };
  try {
    await buildBrowserReplExample(outputDirectory);
    const modulePath = pathToFileURL(
      `${outputDirectory}/worker-client.js`,
    ).href;
    const clientModule: unknown = await import(modulePath);
    assert.ok(typeof clientModule === "object" && clientModule !== null);
    const createClient: unknown = Reflect.get(
      clientModule,
      "createWorkerClient",
    );
    const bindLifecycle: unknown = Reflect.get(
      clientModule,
      "bindWorkerPageLifecycle",
    );
    assert.equal(typeof createClient, "function");
    assert.equal(typeof bindLifecycle, "function");
    if (
      typeof createClient !== "function" || typeof bindLifecycle !== "function"
    ) {
      throw new Error("Missing Worker client lifecycle API.");
    }
    const client = createClient(
      () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      {
        onReady: (ready: boolean) => readyStates.push(ready),
        onPending: (pending: boolean, operation?: string) => {
          pendingStates.push(pending);
          if (pending && operation !== undefined) {
            pendingOperations.push(operation);
          }
        },
        onOutput: (value: string) => outputs.push(value),
        onComplete: (operation: string) => completed.push(operation),
        onWorkerError: (message: string) => failures.push(message),
      },
    );
    let restorations = 0;
    Reflect.apply(bindLifecycle, undefined, [
      client,
      page,
      () => restorations += 1,
    ]);
    const first = workers[0];
    if (first === undefined) throw new Error("Worker was not created.");
    assert.equal(client.submit("1."), false);
    first.emit("message", { data: { type: "ready" } });
    assert.equal(readyStates.at(-1), true);
    assert.equal(client.submit("1."), true);
    assert.equal(client.reset(), false);
    assert.equal(pendingStates.at(-1), true);
    const firstRequest = first.messages[0];
    assert.equal(field(firstRequest, "type"), "submit");

    client.reload();
    assert.equal(first.terminated, true);
    assert.equal(pendingStates.at(-1), false);
    const second = workers[1];
    if (second === undefined) throw new Error("Replacement Worker is missing.");
    first.emit("message", {
      data: {
        type: "complete",
        requestId: field(firstRequest, "requestId"),
        result: { kind: "value", display: "stale" },
      },
    });
    first.emit("message", { data: { type: "output", text: "stale output" } });
    assert.deepEqual(completed, []);
    assert.deepEqual(outputs, []);

    second.emit("message", { data: { type: "ready" } });
    const editedSources = [["math.toss", "%export(99)."]];
    assert.equal(client.updateSources(editedSources), true);
    const sourceUpdate = second.messages[0];
    assert.equal(field(sourceUpdate, "type"), "sources");
    assert.deepEqual(field(sourceUpdate, "sources"), editedSources);
    assert.equal(client.submit("2."), true);
    const secondRequest = second.messages[1];
    second.emit("message", { data: { type: "output", text: "two" } });
    second.emit("message", {
      data: {
        type: "complete",
        requestId: field(secondRequest, "requestId"),
        result: { kind: "value", display: "2" },
      },
    });
    assert.deepEqual(outputs, ["two"]);
    assert.deepEqual(completed, ["submit"]);
    assert.equal(pendingStates.at(-1), false);

    assert.equal(client.reset(editedSources), true);
    const resetRequest = second.messages[2];
    assert.equal(field(resetRequest, "type"), "reset");
    assert.deepEqual(field(resetRequest, "sources"), editedSources);
    second.emit("message", {
      data: { type: "complete", requestId: field(resetRequest, "requestId") },
    });
    assert.deepEqual(completed, ["submit", "reset"]);
    assert.equal(pendingOperations.at(-1), "reset");

    assert.equal(client.submit("3."), true);
    assert.equal(pendingOperations.at(-1), "submit");
    second.emit("message", {
      data: { type: "fatal", message: "runtime bridge failed" },
    });
    assert.equal(readyStates.at(-1), false);
    assert.equal(pendingStates.at(-1), false);
    assert.deepEqual(failures, ["runtime bridge failed"]);
    assert.equal(client.submit("4."), false);
    client.reload();
    const third = workers[2];
    if (third === undefined) throw new Error("Recovered Worker is missing.");
    third.emit("message", { data: { type: "ready" } });
    assert.equal(client.submit("5."), true);
    const thirdRequest = third.messages[0];
    third.emit("message", {
      data: {
        type: "complete",
        requestId: field(thirdRequest, "requestId"),
        result: { kind: "value", display: "5" },
      },
    });
    third.emit("messageerror");
    assert.equal(pendingStates.at(-1), false);
    assert.match(failures.at(-1) ?? "", /unreadable message/);
    client.reload();
    const fourth = workers[3];
    if (fourth === undefined) throw new Error("Final Worker is missing.");
    fourth.emit("message", { data: { type: "ready" } });
    fourth.failPost = true;
    assert.equal(client.submit("6."), false);
    assert.equal(pendingStates.at(-1), false);
    assert.match(failures.at(-1) ?? "", /Worker unavailable/);
    emitPage("pagehide");
    assert.equal(fourth.terminated, true);
    emitPage("pageshow", { persisted: false });
    assert.equal(workers.length, 4);
    emitPage("pageshow", { persisted: true });
    assert.equal(restorations, 1);
    const fifth = workers[4];
    if (fifth === undefined) throw new Error("Restored Worker is missing.");
    fifth.emit("message", { data: { type: "ready" } });
    assert.equal(client.submit("7."), true);
    emitPage("pagehide");
    emitPage("pageshow", { persisted: true });
    assert.equal(restorations, 2);
    const sixth = workers[5];
    if (sixth === undefined) {
      throw new Error("Second restored Worker is missing.");
    }
    sixth.emit("message", { data: { type: "ready" } });
    assert.equal(client.submit("8."), true);
    client.dispose();
    assert.equal(sixth.terminated, true);
  } finally {
    await Deno.remove(outputDirectory, { recursive: true });
  }
});
