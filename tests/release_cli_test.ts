import assert from "node:assert/strict";
import { text } from "./helpers.ts";

for (const entry of ["cli", "runtime_cli", "repl_cli"]) {
  Deno.test(`${entry} reports version and help without permissions or input`, async () => {
    for (const flag of ["--version", "--help", "-h"]) {
      const result = await new Deno.Command(Deno.execPath(), {
        args: ["run", "--no-prompt", `src/${entry}.ts`, flag],
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
      }).output();
      assert.equal(result.code, 0, text(result.stderr));
      assert.equal(text(result.stderr), "");
      if (flag === "--version") {
        assert.equal(text(result.stdout), "toss 0.0.1\n");
      } else {
        assert.match(text(result.stdout), /Usage:/);
      }
    }
  });

  Deno.test(`${entry} rejects unknown and combined informational options`, async () => {
    for (const args of [["--invalid"], ["--version", "--help"]]) {
      const result = await new Deno.Command(Deno.execPath(), {
        args: ["run", "--no-prompt", `src/${entry}.ts`, ...args],
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
      }).output();
      assert.equal(result.code, 1);
      assert.equal(text(result.stdout), "");
      assert.match(text(result.stderr), /Usage:/);
    }
  });
}
