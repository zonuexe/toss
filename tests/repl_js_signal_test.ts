import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { text } from "./helpers.ts";

Deno.test("CLI SIGINT stops a pending JS load and drops later queued cells", async () => {
  const child = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-prompt",
      "--config",
      fileURLToPath(new URL("../deno.json", import.meta.url)),
      fileURLToPath(new URL("../src/repl_cli.ts", import.meta.url)),
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    signal: AbortSignal.timeout(5000),
  }).spawn();
  const writer = child.stdin.getWriter();
  const module = "data:text/javascript," + encodeURIComponent(
    "console.log('loading'); await new Promise(r => setTimeout(r, 30000)); console.log('never'); export const answer = 7;",
  ).replaceAll("'", "%27");
  try {
    await writer.write(new TextEncoder().encode(
      `%jsImport('${module}').\n'queued' print.\n`,
    ));
  } finally {
    await writer.close();
  }
  const stderr = new Response(child.stderr).arrayBuffer();
  const output: string[] = [];
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let interrupted = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output.push(decoder.decode(chunk.value, { stream: true }));
      if (!interrupted && output.join("").includes("loading\n")) {
        interrupted = true;
        child.kill("SIGINT");
      }
    }
    output.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
  const status = await child.status;
  const diagnostic = text(new Uint8Array(await stderr));
  assert.equal(interrupted, true, diagnostic);
  assert.equal(status.code, 130, diagnostic);
  assert.equal(output.join(""), "loading\n");
});
