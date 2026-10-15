import assert from "node:assert/strict";
import { runCli, text } from "./helpers.ts";

Deno.test("compiles a standalone file through the documented task", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-cli-" });
  try {
    const output = `${directory}/nested/hello.js`;

    const result = await new Deno.Command(Deno.execPath(), {
      args: ["task", "compile", "examples/hello.toss", "-o", output],
      stdout: "piped",
      stderr: "piped",
    }).output();

    assert.equal(result.code, 0, text(result.stderr));
    const execution = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-config", "--no-prompt", output],
      cwd: directory,
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(execution.code, 0, text(execution.stderr));
    assert.equal(text(execution.stdout), "Hello, Toss!\n");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("reports syntax errors without writing partial output", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-cli-" });
  try {
    const input = `${directory}/invalid.toss`;
    const output = `${directory}/output.js`;
    await Deno.writeTextFile(input, "'first' print.\n'broken' print");
    await Deno.writeTextFile(output, "existing output");

    const result = await runCli([input, "-o", output]);

    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "");
    assert.ok(text(result.stderr).includes(`${input}:2:15: SyntaxError:`));
    assert.equal(await Deno.readTextFile(output), "existing output");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

for (
  const args of [[], ["examples/hello.toss"], ["examples/hello.toss", "-o"], [
    "--bad",
  ]]
) {
  Deno.test(`rejects invalid CLI arguments ${JSON.stringify(args)}`, async () => {
    const result = await runCli(args);

    assert.notEqual(result.code, 0);
    assert.ok(text(result.stderr).includes("Usage:"));
  });
}

Deno.test("shows usage when help is requested", async () => {
  const result = await runCli(["--help"]);

  assert.equal(result.code, 0);
  assert.ok(text(result.stdout).includes("Usage:"));
  assert.equal(text(result.stderr), "");
});

Deno.test("fails when the source file does not exist", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-cli-" });
  try {
    const input = `${directory}/missing.toss`;

    const result = await runCli([input, "-o", `${directory}/output.js`]);

    assert.notEqual(result.code, 0);
    assert.ok(text(result.stderr).includes("missing.toss"));
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("rejects an output path that would overwrite the source", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-cli-" });
  try {
    const input = `${directory}/source.toss`;
    await Deno.writeTextFile(input, "'hello' print.");

    const result = await runCli([input, "-o", `${directory}/./source.toss`]);

    assert.notEqual(result.code, 0);
    assert.equal(await Deno.readTextFile(input), "'hello' print.");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
