import assert from "node:assert/strict";
import { buildVueExample } from "../examples/vue/build.ts";
import { createVueHandler } from "../examples/vue/server.ts";

Deno.test("Vue build exports working callbacks from the compiled Toss default value", async () => {
  const outputDirectory = await Deno.makeTempDir({ prefix: "toss-vue-" });
  try {
    await buildVueExample(outputDirectory);
    const generated = await Deno.readTextFile(`${outputDirectory}/counter.js`);
    assert.doesNotMatch(generated, /\bevaluateJavaScript\s*\(/);
    assert.doesNotMatch(generated, /\bFunction\s*\(/);
    await Deno.writeTextFile(
      `${outputDirectory}/probe.ts`,
      [
        'import counter from "./counter.js";',
        'console.log([counter.increment(0), counter.increment(1), counter.reset(), counter.increment(0), counter.formatCount(-4)].join("|"));',
        "",
      ].join("\n"),
    );
    const result = await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--no-config",
        "--no-prompt",
        `--allow-read=${outputDirectory}`,
        `${outputDirectory}/probe.ts`,
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(result.code, 0, new TextDecoder().decode(result.stderr));
    assert.equal(new TextDecoder().decode(result.stdout).trim(), "1|2|0|1|-4");
  } finally {
    await Deno.remove(outputDirectory, { recursive: true });
  }
});

Deno.test("Vue handler serves allowlisted assets and rejects the removed bridge route", async () => {
  const outputDirectory = await Deno.makeTempDir({
    prefix: "toss-vue-server-",
  });
  try {
    await buildVueExample(outputDirectory);
    const handle = createVueHandler(outputDirectory);
    const page = await handle(new Request("http://localhost/"));
    const counter = await handle(new Request("http://localhost/counter.js"));
    const bridge = await handle(new Request("http://localhost/bridge.js"));
    assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
    assert.doesNotMatch(
      page.headers.get("content-security-policy") ?? "",
      /unsafe-eval/,
    );
    assert.equal(
      counter.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assert.equal(bridge.status, 404);
  } finally {
    await Deno.remove(outputDirectory, { recursive: true });
  }
});
