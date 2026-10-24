import assert from "node:assert/strict";
import { buildVueExample } from "../examples/vue/build.ts";
import { createVueHandler } from "../examples/vue/server.ts";

Deno.test("compiled Vue bridge runs Toss callbacks and reports missing initialization", async () => {
  const outputDirectory = await Deno.makeTempDir({ prefix: "toss-vue-" });
  try {
    await buildVueExample(outputDirectory);
    await Deno.writeTextFile(
      `${outputDirectory}/deno.json`,
      JSON.stringify({ imports: { "counter-bridge": "./bridge.js" } }),
    );
    await Deno.writeTextFile(
      `${outputDirectory}/probe.ts`,
      [
        'import "./counter.js";',
        'import { formatCount, increment, reset } from "./bridge.js";',
        'console.log([increment(0), increment(1), reset(), increment(0), formatCount(-4)].join("|"));',
        "",
      ].join("\n"),
    );
    await Deno.writeTextFile(
      `${outputDirectory}/missing.ts`,
      ['import { increment } from "./bridge.js";', "increment(0);", ""].join(
        "\n",
      ),
    );
    const run = (script: string) =>
      new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          `--config=${outputDirectory}/deno.json`,
          `--allow-read=${outputDirectory}`,
          `${outputDirectory}/${script}`,
        ],
        stdout: "piped",
        stderr: "piped",
      }).output();
    const callbacks = await run("probe.ts");
    assert.equal(callbacks.code, 0);
    assert.equal(
      new TextDecoder().decode(callbacks.stdout).trim(),
      "1|2|0|1|-4",
    );

    const missing = await run("missing.ts");
    assert.notEqual(missing.code, 0);
    assert.match(
      new TextDecoder().decode(missing.stderr),
      /import counter\.js before using it/,
    );
  } finally {
    await Deno.remove(outputDirectory, { recursive: true });
  }
});

Deno.test("Vue handler serves allowlisted assets with types and rejects unknown routes", async () => {
  const outputDirectory = await Deno.makeTempDir({
    prefix: "toss-vue-server-",
  });
  try {
    await buildVueExample(outputDirectory);
    const handle = createVueHandler(outputDirectory);
    const page = await handle(new Request("http://localhost/"));
    const bridge = await handle(new Request("http://localhost/bridge.js"));
    const missing = await handle(new Request("http://localhost/private.toss"));
    assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
    assert.match(
      page.headers.get("content-security-policy") ?? "",
      /unsafe-eval/,
    );
    assert.equal(
      bridge.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assert.equal(missing.status, 404);
  } finally {
    await Deno.remove(outputDirectory, { recursive: true });
  }
});
