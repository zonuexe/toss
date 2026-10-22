import assert from "node:assert/strict";
import "hono";
import { compileFile } from "../src/compiler.ts";
import { executeJavaScript, text } from "./helpers.ts";

Deno.test("Hono library serves the sample scenarios through the Toss application", async () => {
  const javascript = await compileFile("examples/hono/verify.toss");

  const result = await executeJavaScript(javascript, { cachedOnly: true });

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(
    text(result.stdout),
    "GET /hello/Toss: 200 Hello, Toss!\n" +
      'POST /echo Alice: 201 {"name":"Alice","language":"Toss"}\n' +
      'POST /echo Bob: 201 {"name":"Bob","language":"Toss"}\n' +
      'POST /echo invalid JSON: 400 {"error":"invalid body"}\n' +
      'POST /echo invalid name: 400 {"error":"name must be a String"}\n' +
      "GET /missing: 404\nHono verification passed (6 checks)\n",
  );
});

Deno.test("Hono library supports an independent app and custom error policy", async () => {
  const javascript = await compileFile("examples/hono/independent-verify.toss");

  const result = await executeJavaScript(javascript, { cachedOnly: true });

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "Independent Hono verification passed\n");
});

Deno.test("Hono library creates independent native apps in one consumer", async () => {
  const files: Record<string, string> = {};
  for await (const entry of Deno.readDir("lib/hono")) {
    if (entry.isFile && entry.name.endsWith(".toss")) {
      files[`lib/hono/${entry.name}`] = await Deno.readTextFile(
        `lib/hono/${entry.name}`,
      );
    }
  }
  files["main.toss"] = `
    %macroImport('./lib/hono/macros.toss').
    #adapter bind: %import('./lib/hono/adapter.toss').
    #testing bind: %import('./lib/hono/testing.toss').
    #first bind: $adapter create.
    #second bind: $adapter create.
    $first get: '/one' handle: { context -> $context text: 'one' }.
    $second get: '/two' handle: %async({ context -> $context text: 'two' }).
    %runAsync({
      #one bind: %request($first request: '/one').
      %await($testing bodyText: $one) print.
      #missing bind: %request($second request: '/one').
      ($testing status: $missing) print.
      #two bind: %request($second request: '/two').
      %await($testing bodyText: $two) print.
      %js(app = ($first native); typeof app.fetch === 'function') print
    }).`;

  const directory = await Deno.makeTempDir({ prefix: "toss-hono-library-" });
  try {
    for (const [path, source] of Object.entries(files)) {
      const target = `${directory}/${path}`;
      await Deno.mkdir(target.slice(0, target.lastIndexOf("/")), {
        recursive: true,
      });
      await Deno.writeTextFile(target, source);
    }

    const javascript = await compileFile(`${directory}/main.toss`);
    const result = await executeJavaScript(javascript, { cachedOnly: true });

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "one\n404\ntwo\ntrue\n");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
