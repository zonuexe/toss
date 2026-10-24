import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { text } from "./helpers.ts";

const cli = `${Deno.cwd()}/src/repl_cli.ts`;

function launch(args: readonly string[] = []): Deno.ChildProcess {
  return new Deno.Command(Deno.execPath(), {
    args: ["run", "--no-prompt", ...args, cli],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
}

Deno.test("CLI loads built-ins without filesystem permissions and drains EOF", async () => {
  const child = launch();
  const writer = child.stdin.getWriter();
  await writer.write(
    new TextEncoder().encode([
      "#path bind: %jsImport('node:path').",
      "%js(path = $path; path.basename('/tmp/value.txt')).",
      ":reset",
      "8.",
      ":quit",
      "9.",
    ].join("\n")),
  );
  await writer.close();
  const result = await child.output();
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), '=> <js>\n=> "value.txt"\n=> 8\n');
  assert.equal(text(result.stderr), "");
});

Deno.test("CLI Ctrl-C exits while a host module import is pending", async () => {
  const directory = await Deno.makeTempDir();
  const marker = `${directory}/started`;
  const modulePath = `${directory}/pending.mjs`;
  const source = [
    `await Deno.writeTextFile(${JSON.stringify(marker)}, "started");`,
    "await new Promise(() => {});",
    "export const value = 1;",
  ].join("\n");
  await Deno.writeTextFile(modulePath, source);
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "--no-prompt", "--allow-read", "--allow-write", cli],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const watchdog = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    await child.stdin.getWriter().write(
      new TextEncoder().encode(`%jsImport('${pathToFileURL(modulePath)}').\n`),
    );
    let started = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await Deno.stat(marker);
        started = true;
        break;
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
    }
    assert.equal(started, true, "host module did not begin initialization");
    child.kill("SIGINT");
    const result = await child.output();
    assert.equal(result.code, 130, text(result.stderr));
    assert.equal(text(result.stdout), "");
  } finally {
    clearTimeout(watchdog);
    await Deno.remove(directory, { recursive: true });
  }
});
