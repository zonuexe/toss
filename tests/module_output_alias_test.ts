import assert from "node:assert/strict";
import { join } from "node:path";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { validateModuleOutput } from "../src/module_output.ts";
import { runCli, text } from "./helpers.ts";

const hardLinksAvailable = await canCreateHardLinks();

async function canCreateHardLinks(): Promise<boolean> {
  const directory = await Deno.makeTempDir({ prefix: "toss-link-support-" });
  try {
    const source = join(directory, "source");
    await Deno.writeTextFile(source, "source");
    try {
      await Deno.link(source, join(directory, "alias"));
    } catch (error) {
      if (error instanceof Deno.errors.NotSupported) return false;
      throw error;
    }
    return true;
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}

for (
  const [name, entry, sourceFile, source] of [
    ["entry", "42 print.", "main.toss", "42 print."],
    [
      "dependency",
      "%import('./library.toss') print.",
      "library.toss",
      "%export(42).",
    ],
    [
      "macro library",
      "%macroImport('./library.toss'). %answer() print.",
      "library.toss",
      "%macro(#answer, { syntax -> %quote(42) }).",
    ],
  ] as const
) {
  Deno.test({
    name: `CLI preserves ${name} source when output is its hard link`,
    ignore: !hardLinksAvailable,
    async fn() {
      const directory = await Deno.makeTempDir({
        prefix: "toss-output-alias-",
      });
      try {
        const input = join(directory, "main.toss");
        const protectedSource = join(directory, sourceFile);
        const output = join(directory, "bundle.js");
        await Deno.writeTextFile(input, entry);
        await Deno.writeTextFile(protectedSource, source);
        await Deno.link(protectedSource, output);

        const result = await runCli([input, "-o", output]);

        assert.notEqual(
          result.code,
          0,
          "Compilation must reject a source alias.",
        );
        assert.match(
          text(result.stderr),
          /(?:must not|Cannot safely) overwrite/,
        );
        assert.equal(await Deno.readTextFile(protectedSource), source);
        assert.equal(await Deno.readTextFile(output), source);
      } finally {
        await Deno.remove(directory, { recursive: true });
      }
    },
  });
}

for (const destination of ["new", "existing", "source"] as const) {
  Deno.test(`output validation keeps path protection with unavailable IDs: ${destination}`, async () => {
    const directory = await Deno.makeTempDir({ prefix: "toss-output-ids-" });
    const stat = Deno.stat;
    try {
      const input = join(directory, "main.toss");
      const output = destination === "source"
        ? input
        : join(directory, "bundle.js");
      await Deno.writeTextFile(input, "42 print.");
      if (destination === "existing") {
        await Deno.writeTextFile(output, "old output");
      }
      Deno.stat = async (path) => ({ ...await stat(path), ino: null });
      const options = {
        input,
        output,
        moduleSources: [await Deno.realPath(input)],
        macroLibraries: new Set<string>(),
      };

      if (destination !== "new") {
        await assert.rejects(
          () => validateModuleOutput(options),
          TossSyntaxError,
        );
      } else {
        await validateModuleOutput(options);
      }

      assert.equal(await Deno.readTextFile(input), "42 print.");
    } finally {
      Deno.stat = stat;
      await Deno.remove(directory, { recursive: true });
    }
  });
}

for (const unavailable of ["output", "source"] as const) {
  Deno.test({
    name:
      `CLI preserves a hard-linked source when ${unavailable} inode is unavailable`,
    ignore: !hardLinksAvailable,
    async fn() {
      const directory = await Deno.makeTempDir({ prefix: "toss-output-null-" });
      try {
        const input = join(directory, "main.toss");
        const output = join(directory, "bundle.js");
        const wrapper = join(directory, "cli.ts");
        await Deno.writeTextFile(input, "42 print.");
        await Deno.link(input, output);
        const hidden = await Deno.realPath(
          unavailable === "output" ? output : input,
        );
        const cli = new URL("../src/cli.ts", import.meta.url).href;
        await Deno.writeTextFile(
          wrapper,
          [
            `import { main } from ${JSON.stringify(cli)};`,
            "const stat = Deno.stat;",
            `Deno.stat = async (path) => {`,
            "  const info = await stat(path);",
            `  return path === ${
              JSON.stringify(hidden)
            } ? { ...info, ino: null } : info;`,
            "};",
            "await main(Deno.args);",
          ].join("\n"),
        );

        const result = await new Deno.Command(Deno.execPath(), {
          args: [
            "run",
            "--no-prompt",
            "--allow-read",
            "--allow-write",
            "--config",
            "deno.json",
            wrapper,
            input,
            "-o",
            output,
          ],
          stdout: "piped",
          stderr: "piped",
        }).output();

        assert.equal(result.code, 1, text(result.stderr));
        assert.match(text(result.stderr), /Cannot safely overwrite/);
        assert.equal(await Deno.readTextFile(input), "42 print.");
        assert.equal(await Deno.readTextFile(output), "42 print.");
      } finally {
        await Deno.remove(directory, { recursive: true });
      }
    },
  });
}

for (const exists of [false, true]) {
  Deno.test(`CLI writes an unrelated output file when it exists: ${exists}`, async () => {
    const directory = await Deno.makeTempDir({ prefix: "toss-output-write-" });
    try {
      const input = join(directory, "main.toss");
      const output = join(directory, "bundle.js");
      await Deno.writeTextFile(input, "42 print.");
      if (exists) await Deno.writeTextFile(output, "old output");

      const compiled = await runCli([input, "-o", output]);

      assert.equal(compiled.code, 0, text(compiled.stderr));
      const result = await new Deno.Command(Deno.execPath(), {
        args: ["run", "--no-config", "--no-prompt", output],
        stdout: "piped",
        stderr: "piped",
      }).output();
      assert.equal(result.code, 0, text(result.stderr));
      assert.equal(text(result.stdout), "42\n");
      assert.equal(await Deno.readTextFile(input), "42 print.");
    } finally {
      await Deno.remove(directory, { recursive: true });
    }
  });
}
