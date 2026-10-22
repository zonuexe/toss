import assert from "node:assert/strict";
import { join } from "node:path";
import { runCli, text } from "./helpers.ts";

async function project(
  files: Readonly<Record<string, string>>,
  action: (directory: string, input: string, output: string) => Promise<void>,
): Promise<void> {
  const directory = await Deno.makeTempDir({ prefix: "toss-js-cli-" });
  try {
    for (const [name, source] of Object.entries(files)) {
      await Deno.writeTextFile(join(directory, name), source);
    }
    await action(
      directory,
      join(directory, "main.toss"),
      join(directory, "bundle.js"),
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}

Deno.test("JS CLI compiles without executing host effects and runs without Toss files", async () => {
  await project({
    "main.toss": "%js(x = %import('./value.toss'); console.log(x)).",
    "value.toss": "%export(42).",
  }, async (directory, input, output) => {
    const compiled = await runCli([input, "-o", output]);
    assert.equal(compiled.code, 0, text(compiled.stderr));
    assert.equal(text(compiled.stdout), "");
    await Deno.remove(input);
    await Deno.remove(join(directory, "value.toss"));
    const result = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-config", "--no-prompt", output],
      cwd: directory,
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "42\n");
  });
});

Deno.test("JS CLI reports dependency syntax errors before replacing existing output", async () => {
  await project({
    "main.toss": "#unused bind: { %import('./bad.toss') }.",
    "bad.toss": "%export(1).\n%js(1; 2).",
  }, async (_directory, input, output) => {
    await Deno.writeTextFile(output, "previous output");
    const result = await runCli([input, "-o", output]);
    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "");
    assert.match(text(result.stderr), /bad\.toss:2:\d+: SyntaxError:/);
    assert.equal(await Deno.readTextFile(output), "previous output");
  });
});

Deno.test("JS CLI validates missing imports inside an unused JS binding", async () => {
  await project({
    "main.toss": "#unused bind: { %js(x = %import('./missing.toss'); x) }.",
  }, async (_directory, input, output) => {
    const result = await runCli([input, "-o", output]);
    assert.notEqual(result.code, 0);
    assert.match(text(result.stderr), /main\.toss:1:25:/);
    assert.match(text(result.stderr), /missing\.toss/);
  });
});
