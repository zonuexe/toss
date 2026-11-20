import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { waitForHost } from "../experiments/abortable-host-wait.ts";
import { executeModuleJavaScript } from "./helpers.ts";

Deno.test("aborting one wait preserves its reason and another wait on the same operation", async () => {
  const operation = Promise.withResolvers<number>();
  const controller = new AbortController();
  const cancelled = waitForHost(operation.promise, controller.signal);
  const continuing = waitForHost(
    operation.promise,
    new AbortController().signal,
  );
  const reason = new Error("cancelled");
  controller.abort(reason);
  await assert.rejects(cancelled, (error: unknown) => error === reason);
  operation.resolve(42);
  assert.equal(await continuing, 42);
});

Deno.test("aborted host wait runs cleanup before a Toss Promise diagnostic", async () => {
  const observer = `data:text/javascript;base64,${
    btoa(`
    export function onEffectFailure(diagnostic) {
      globalThis.events.push("diagnostic:" + diagnostic.boundary);
      globalThis.diagnostic = diagnostic;
    }
  `)
  }`;
  const javascript = compile(
    "%export(%async({ wait -> %await($wait). 'unexpected' print }) asJSCallback).",
    "cancel.toss",
    { format: "esm", failureObserverImport: observer },
  );
  const adapter =
    new URL("../experiments/abortable-host-wait.ts", import.meta.url).href;
  const result = await executeModuleJavaScript(
    javascript,
    `
    import { waitForHost } from ${JSON.stringify(adapter)};
    globalThis.events = [];
    const operation = Promise.withResolvers();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    const waiting = waitForHost(operation.promise, controller.signal).finally(async () => {
      events.push("cleanup start");
      await Promise.resolve();
      events.push("cleanup end");
    });
    const toss = value(waiting).catch(error => {
      events.push("host catch");
      console.log(error.cause === reason, diagnostic.error === error);
    });
    controller.abort(reason);
    await toss;
    operation.reject(new Error("late operation rejection"));
    await new Promise(resolve => setTimeout(resolve, 0));
    console.log(events.join("|"));
  `,
  );
  const decoder = new TextDecoder();
  assert.equal(result.success, true, decoder.decode(result.stderr));
  assert.equal(
    decoder.decode(result.stdout),
    "true true\ncleanup start|cleanup end|diagnostic:promise|host catch\n",
  );

  const cooperative = await executeModuleJavaScript(
    javascript,
    `
    globalThis.events = [];
    const controller = new AbortController();
    const reason = new Error("stop host work");
    const operation = new Promise((_, reject) => {
      controller.signal.addEventListener("abort", () => {
        events.push("host abort");
        reject(controller.signal.reason);
      }, { once: true });
    }).finally(async () => {
      await Promise.resolve();
      events.push("host cleanup");
    });
    const toss = value(operation).catch(error => {
      events.push("host catch");
      console.log(error.cause === reason, diagnostic.error === error);
    });
    controller.abort(reason);
    await toss;
    console.log(events.join("|"));
  `,
  );
  assert.equal(cooperative.success, true, decoder.decode(cooperative.stderr));
  assert.equal(
    decoder.decode(cooperative.stdout),
    "true true\nhost abort|host cleanup|diagnostic:promise|host catch\n",
  );
});
