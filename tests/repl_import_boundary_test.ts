import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { text } from "./helpers.ts";

const cli = fileURLToPath(new URL("../src/repl_cli.ts", import.meta.url));
const config = fileURLToPath(new URL("../deno.json", import.meta.url));
const original = "%macro(#answer, { syntax -> %quote(11) }).";
const changed = "%macro(#answer, { syntax -> %quote(22) }).";

type Fixture = {
  readonly files: Readonly<Record<string, string>>;
  readonly input: readonly string[];
  readonly allowRead?: boolean;
};

async function runFixture(fixture: Fixture): Promise<Deno.CommandOutput> {
  const root = await Deno.makeTempDir({ prefix: "toss-repl-import-boundary-" });
  try {
    for (const [name, source] of Object.entries(fixture.files)) {
      const path = join(root, name);
      await Deno.mkdir(dirname(path), { recursive: true });
      await Deno.writeTextFile(path, source);
    }
    const child = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--config",
        config,
        "--no-prompt",
        ...(fixture.allowRead === false ? [] : ["--allow-read"]),
        "--allow-write",
        cli,
      ],
      cwd: root,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
      signal: AbortSignal.timeout(10000),
    }).spawn();
    const writer = child.stdin.getWriter();
    try {
      await writer.write(
        new TextEncoder().encode(fixture.input.join("\n") + "\n"),
      );
    } finally {
      await writer.close();
    }
    return await child.output();
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test("REPL imports cache canonical libraries until reset", async () => {
  const fixture: Fixture = {
    files: { "macros.toss": original },
    input: [
      "%macroImport('./macros.toss').",
      "%answer().",
      `%js(Deno.writeTextFileSync('macros.toss', ${JSON.stringify(changed)})).`,
      "%macroImport('././macros.toss').",
      "%answer().",
      ":reset",
      "%macroImport('./macros.toss').",
      "%answer().",
    ],
  };

  const result = await runFixture(fixture);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "=> 11\n=> nil\n=> 11\n=> 22\n");
  assert.equal(text(result.stderr), "");
});

Deno.test("failed cells commit neither imported definitions nor cache entries", async () => {
  const fixture: Fixture = {
    files: { "macros.toss": original },
    input: [
      "%macroImport('./macros.toss'). #effect bind: 1. 3 add: .",
      "%answer().",
      "$effect.",
      `%js(Deno.writeTextFileSync('macros.toss', ${JSON.stringify(changed)})).`,
      "%macroImport('./macros.toss'). %answer().",
    ],
  };

  const result = await runFixture(fixture);

  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> nil\n=> 22\n");
  assert.match(text(result.stderr), /Macro %answer is not defined/);
  assert.match(text(result.stderr), /Unbound name "effect"/);
});

Deno.test("runtime failure retains a successfully compiled macro import", async () => {
  const fixture: Fixture = {
    files: { "macros.toss": original },
    input: ["%macroImport('./macros.toss'). $missing.", "%answer()."],
  };

  const result = await runFixture(fixture);

  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> 11\n");
  assert.match(text(result.stderr), /Unbound name "missing"/);
});

Deno.test("REPL reset retains the startup directory after host cwd changes", async () => {
  const fixture: Fixture = {
    files: { "macros.toss": original, "other/macros.toss": changed },
    input: [
      "%js(Deno.chdir('other')).",
      "%macroImport('./macros.toss'). %answer().",
      ":reset",
      "%macroImport('./macros.toss'). %answer().",
    ],
  };

  const result = await runFixture(fixture);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "=> nil\n=> 11\n=> 11\n");
  assert.equal(text(result.stderr), "");
});

Deno.test("imported macro diagnostics retain library and later-cell positions", async () => {
  const fixture: Fixture = {
    files: {
      "macros.toss": "%macro(#missing, { syntax -> %quote($notThere) }).",
    },
    input: ["7.", "%macroImport('./macros.toss').", "%missing()."],
  };

  const result = await runFixture(fixture);

  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> 7\n");
  assert.match(text(result.stderr), /macros\.toss:1:/);
  assert.match(text(result.stderr), /at <repl>:3:/);
});

Deno.test("denied macro reads report an error without disabling ordinary evaluation", async () => {
  const fixture: Fixture = {
    files: { "macros.toss": original },
    input: ["7.", "%macroImport('./macros.toss').", "8."],
    allowRead: false,
  };

  const result = await runFixture(fixture);

  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> 7\n=> 8\n");
  assert.match(text(result.stderr), /Unable to (resolve|read) macro library/);
  assert.match(text(result.stderr), /<repl>:2:/);
});
