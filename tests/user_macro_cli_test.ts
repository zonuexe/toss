import assert from "node:assert/strict";
import { join } from "node:path";
import { runCli, text } from "./helpers.ts";

async function project(
  source: string,
  action: (directory: string, input: string, output: string) => Promise<void>,
): Promise<void> {
  const directory = await Deno.makeTempDir({ prefix: "toss-user-macro-cli-" });
  try {
    const input = join(directory, "main.toss");
    await Deno.writeTextFile(input, source);
    await action(directory, input, join(directory, "program.js"));
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}

Deno.test("macro CLI emits standalone JS and does not run quoted host effects", async () => {
  await project(
    "%macro(#say, { s -> %quote(%js(console.log('runtime'))) }). %say().",
    async (directory, input, output) => {
      const compiled = await runCli([input, "-o", output]);
      assert.equal(compiled.code, 0, text(compiled.stderr));
      assert.equal(text(compiled.stdout), "");
      await Deno.remove(input);
      const result = await new Deno.Command(Deno.execPath(), {
        args: ["run", "--no-config", "--no-prompt", output],
        cwd: directory,
        stdout: "piped",
        stderr: "piped",
      }).output();
      assert.equal(result.code, 0, text(result.stderr));
      assert.equal(text(result.stdout), "runtime\n");
    },
  );
});

Deno.test("macro CLI preserves existing output after expansion failure", async () => {
  await project(
    "%macro(#broken, { s -> 1 }).\n%broken().",
    async (_directory, input, output) => {
      await Deno.writeTextFile(output, "existing output");
      const result = await runCli([input, "-o", output]);
      assert.notEqual(result.code, 0);
      assert.equal(text(result.stdout), "");
      assert.match(text(result.stderr), /broken/);
      assert.match(text(result.stderr), /main\.toss:2:/);
      assert.equal(await Deno.readTextFile(output), "existing output");
    },
  );
});
