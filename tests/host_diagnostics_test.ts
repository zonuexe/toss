import assert from "node:assert/strict";
import {
  compile,
  compileSources,
  generateRuntimeModule,
} from "../src/compiler.ts";
import { executeModuleJavaScript } from "./helpers.ts";

const moduleUrl = (source: string): string =>
  `data:text/javascript;base64,${btoa(source)}`;
const failureObserverImport = moduleUrl(`
  export function onEffectFailure(diagnostic) {
    globalThis.diagnostics.push(diagnostic);
    throw "observer failure";
  }
  export function onEffectObserverError(failure) {
    globalThis.observerFailures.push(failure);
  }
`);
const runtimeImport = moduleUrl(generateRuntimeModule());

Deno.test("CLI resolves the failure observer relative to the output artifact", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-observer-cli-" });
  try {
    const source = `${directory}/main.toss`;
    const output = `${directory}/out/program.mjs`;
    await Deno.writeTextFile(source, "$missing.");
    const build = await new Deno.Command(Deno.execPath(), {
      args: [
        "task",
        "compile",
        source,
        "-o",
        output,
        "--failure-observer-import",
        "./observer.mjs",
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    const decoder = new TextDecoder();
    assert.equal(build.success, true, decoder.decode(build.stderr));
    await Deno.writeTextFile(
      `${directory}/out/observer.mjs`,
      "export function onEffectFailure(diagnostic) { console.log(diagnostic.boundary); }",
    );
    const result = await new Deno.Command(Deno.execPath(), {
      args: ["run", output],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(result.success, false);
    assert.equal(decoder.decode(result.stdout), "entry\n");
    assert.match(decoder.decode(result.stderr), /missing/);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

for (const external of [false, true]) {
  Deno.test(`normal AOT reports host failures with external runtime=${external}`, async () => {
    const options = {
      format: "esm" as const,
      failureObserverImport,
      ...(external ? { runtimeImport } : { treeShakePrelude: true }),
    };
    const javascript = compileSources(
      "main.toss",
      new Map([
        [
          "main.toss",
          `#callbacks bind: [
        { $missing } asJSCallback,
        %async({ %await(%js(Promise.reject(globalThis.cause))) }) asJSCallback
      ]. %export({ index -> $callbacks at: $index } asJSCallback).`,
        ],
      ]),
      options,
    );
    const failure = compile("%export($missing).", "entry.toss", options);
    const result = await executeModuleJavaScript(
      javascript,
      `
      globalThis.diagnostics = [];
      globalThis.observerFailures = [];
      globalThis.cause = new Error("original");
      let callbackError;
      try { value(0)(); } catch (error) { callbackError = error; }
      const promiseError = await value(1)().catch(error => error);
      try { await import(${
        JSON.stringify(moduleUrl(failure))
      }); } catch (error) {
        if (!error.message.includes("missing")) throw error;
      }
      const [callback, promise, entry] = globalThis.diagnostics;
      console.log(callback.boundary, callback.error === callbackError);
      console.log(promise.boundary, promise.error === promiseError, promiseError.cause === globalThis.cause);
      console.log(entry.boundary, entry.cleanupDescriptions.length, entry.handlerDescriptions.length);
      console.log(globalThis.observerFailures.every((f, i) =>
        f.diagnostic === globalThis.diagnostics[i] && f.kind === "throw" && f.cause === "observer failure"),
        globalThis.observerFailures.length);
    `,
    );
    const decoder = new TextDecoder();
    assert.equal(result.success, true, decoder.decode(result.stderr));
    assert.equal(
      decoder.decode(result.stdout),
      "callback true\npromise true true\nentry 0 0\ntrue 3\n",
    );
  });
}
