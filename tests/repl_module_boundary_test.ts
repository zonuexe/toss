import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { text } from "./helpers.ts";

type Fixture = {
  readonly files: Readonly<Record<string, string>>;
  readonly input: readonly string[];
  readonly allowRead?: boolean;
  readonly aliases?: Readonly<Record<string, string>>;
};

async function runFixture(fixture: Fixture): Promise<Deno.CommandOutput> {
  const root = await Deno.makeTempDir({ prefix: "toss-repl-module-boundary-" });
  try {
    for (const [name, source] of Object.entries(fixture.files)) {
      const path = join(root, name);
      await Deno.mkdir(dirname(path), { recursive: true });
      await Deno.writeTextFile(path, source);
    }
    for (const [name, target] of Object.entries(fixture.aliases ?? {})) {
      await Deno.symlink(target, join(root, name));
    }
    const child = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--config",
        fileURLToPath(new URL("../deno.json", import.meta.url)),
        "--no-prompt",
        ...(fixture.allowRead === false ? [] : ["--allow-read"]),
        "--allow-write",
        fileURLToPath(new URL("../src/repl_cli.ts", import.meta.url)),
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

Deno.test("CLI keeps lazy module source stable until reset", async () => {
  const result = await runFixture({
    files: { "value.toss": "'old' print. %export(11)." },
    input: [
      "#load bind: { %import('./value.toss') }.",
      "%js(Deno.writeTextFileSync('value.toss', \"'new' print. %export(22).\")).",
      "$load value.",
      "%import('././value.toss').",
      ":reset",
      "%import('./value.toss').",
    ],
  });
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(
    text(result.stdout),
    "=> <block>\n=> nil\nold\n=> 11\n=> 11\nnew\n=> 22\n",
  );
});

Deno.test("CLI retries a corrected graph after a compilation failure", async () => {
  const result = await runFixture({
    files: { "value.toss": "%export(11)." },
    input: [
      "'never' print. %macro(#answer, { s -> %quote(1) }). %import('./value.toss'). { %import('./missing.toss') }.",
      "%answer().",
      "%js(Deno.writeTextFileSync('value.toss', '%export(22).')).",
      "%import('./value.toss').",
    ],
  });
  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> nil\n=> 22\n");
  assert.match(text(result.stderr), /Imported file not found/);
  assert.match(text(result.stderr), /Macro %answer is not defined/);
});

Deno.test("CLI caches initialization failure and resets it explicitly", async () => {
  const result = await runFixture({
    files: { "failure.toss": "'once' print. %export(1). $unbound." },
    input: [
      "%import('./failure.toss').",
      "%js(Deno.writeTextFileSync('failure.toss', '%export(9).')).",
      "%import('././failure.toss').",
      "7.",
      ":reset",
      "%import('./failure.toss').",
    ],
  });
  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "once\n=> nil\n=> 7\n=> 9\n");
  assert.equal(text(result.stderr).match(/Unbound name "unbound"/g)?.length, 2);
  assert.match(text(result.stderr), /failure\.toss:1:/);
});

Deno.test("CLI retains module registrations after a cell runtime failure", async () => {
  const result = await runFixture({
    files: { "value.toss": "%export(11)." },
    input: [
      "$missing. %import('./value.toss').",
      "%js(Deno.writeTextFileSync('value.toss', '%export(22).')).",
      "%import('./value.toss').",
    ],
  });
  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> nil\n=> 11\n");
  assert.match(text(result.stderr), /Unbound name "missing"/);
});

Deno.test("CLI modules retain file-relative macro and runtime imports", async () => {
  const result = await runFixture({
    files: {
      "lib/factory.toss":
        "%macroImport('./macros.toss'). #secret bind: 4. %export({ %plus(%import('./value.toss')) add: $secret }).",
      "lib/macros.toss": "%macro(#plus, { s -> %`((%,($s)) add: 1) }).",
      "lib/value.toss": "%export(7).",
      "value.toss": "%export(99).",
    },
    input: [
      "#secret bind: 100.",
      "#load bind: %import('./lib/factory.toss').",
      "$load value.",
      "%plus(1).",
    ],
  });
  assert.equal(result.code, 1);
  assert.equal(
    text(result.stdout),
    "=> 100\n=> <block>\n=> 12\n",
    text(result.stderr),
  );
  assert.match(text(result.stderr), /Macro %plus is not defined/);
});

Deno.test("CLI local import base survives cwd changes and reset", async () => {
  const result = await runFixture({
    files: { "value.toss": "%export(11).", "other/value.toss": "%export(22)." },
    input: [
      "%js(Deno.chdir('other')).",
      "%import('./value.toss').",
      ":reset",
      "%import('./value.toss').",
    ],
  });
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "=> nil\n=> 11\n=> 11\n");
});

Deno.test("CLI module permission errors leave ordinary cells usable", async () => {
  const result = await runFixture({
    files: { "value.toss": "%export(11)." },
    input: ["7.", "%import('./value.toss').", ":reset", "8."],
    allowRead: false,
  });
  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> 7\n=> 8\n");
  assert.match(text(result.stderr), /Unable to (resolve|read) imported file/);
  assert.match(text(result.stderr), /<repl>:2:/);
});

Deno.test("CLI escaped Blocks keep their compiled dependency after a symlink changes", async () => {
  const result = await runFixture({
    files: { "one.toss": "%export(11).", "two.toss": "%export(22)." },
    aliases: { "alias.toss": "one.toss" },
    input: [
      "#load bind: { %import('./alias.toss') }.",
      "%js((Deno.removeSync('alias.toss'), Deno.symlinkSync('two.toss', 'alias.toss'))).",
      "%import('./alias.toss').",
      "$load value.",
    ],
  });
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "=> <block>\n=> nil\n=> 22\n=> 11\n");
});

Deno.test("CLI module macro libraries retain canonical idempotence", async () => {
  const result = await runFixture({
    files: {
      "value.toss":
        "%macroImport('./macros.toss'). %macroImport('././macros.toss'). %export(%answer()).",
      "macros.toss": "%macro(#answer, { s -> %quote(11) }).",
    },
    input: ["%import('./value.toss')."],
  });
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "=> 11\n");
});

Deno.test("CLI module host errors retain a separate cause line", async () => {
  const result = await runFixture({
    files: {
      "failure.toss":
        "%export(%js((() => { throw new Error('host-fail'); })())).",
    },
    input: ["%import('./failure.toss').", "7."],
  });
  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> 7\n");
  assert.match(text(result.stderr), /failure\.toss:1:/);
  assert.match(text(result.stderr), /\n {2}caused by: host-fail\n/);
});

Deno.test("CLI reports the actual invalid JS import position before effects", async () => {
  const result = await runFixture({
    files: {
      "value.toss":
        "1.\n#load bind: { %jsImport('./invalid.mjs') }.\n%export($load).",
    },
    input: ["'never' print. %import('./value.toss').", "7."],
  });
  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> 7\n");
  assert.match(
    text(result.stderr),
    /value\.toss:2:\d+: SyntaxError: Invalid JavaScript module specifier/,
  );
});
