import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { text } from "./helpers.ts";

type Fixture = {
  readonly files: Readonly<Record<string, string>>;
  readonly input: (root: string) => readonly string[];
};

async function runFixture(fixture: Fixture): Promise<Deno.CommandOutput> {
  const root = await Deno.makeTempDir({ prefix: "toss-repl-js-boundary-" });
  try {
    for (const [name, source] of Object.entries(fixture.files)) {
      const file = join(root, name);
      await Deno.mkdir(dirname(file), { recursive: true });
      await Deno.writeTextFile(file, source);
    }
    const child = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--no-prompt",
        "--allow-read",
        "--allow-write",
        "--config",
        fileURLToPath(new URL("../deno.json", import.meta.url)),
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
        new TextEncoder().encode(fixture.input(root).join("\n") + "\n"),
      );
    } finally {
      await writer.close();
    }
    return await child.output();
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

function jsImport(root: string, name: string): string {
  return `%jsImport('${pathToFileURL(join(root, name)).href}')`;
}

Deno.test("CLI imports a host builtin and uses its namespace in a later cell", async () => {
  const result = await runFixture({
    files: {},
    input: () => [
      "#path bind: %jsImport('node:path').",
      "%js(module = $path; module.basename('/tmp/hello.txt')).",
    ],
  });
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), '=> <js>\n=> "hello.txt"\n');
});

Deno.test("CLI namespace identity and JS initialization survive Toss reset", async () => {
  const result = await runFixture({
    files: {
      "value.mjs": "console.log('initialized'); export const answer = 41;",
    },
    input: (root) => [
      `#one bind: ${jsImport(root, "value.mjs")}.`,
      `#two bind: ${jsImport(root, "value.mjs")}.`,
      "%js(a = $one, b = $two; a === b).",
      ":reset",
      `#again bind: ${jsImport(root, "value.mjs")}.`,
      "%js(module = $again; module.answer).",
    ],
  });
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(
    text(result.stdout),
    "initialized\n=> <js>\n=> <js>\n=> true\n=> <js>\n=> 41\n",
  );
});

Deno.test("CLI eagerly loads JS in an unused Block of a lazy Toss module", async () => {
  const result = await runFixture({
    files: {
      "value.mjs": "console.log('js-loaded'); export const answer = 7;",
    },
    input: (root) => [
      `%js(Deno.writeTextFileSync('lazy.toss', ${
        JSON.stringify(
          `'toss-loaded' print. %export({ ${jsImport(root, "value.mjs")} }).`,
        )
      })).`,
      "#later bind: { %import('./lazy.toss') }. 7.",
      "8.",
    ],
  });
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "=> nil\njs-loaded\n=> 7\n=> 8\n");
});

Deno.test("CLI validates the whole cell before any JS module effects", async () => {
  const result = await runFixture({
    files: {
      "value.mjs": "globalThis.__tossImportProbe = 1; export const answer = 7;",
    },
    input: (root) => [
      `'never' print. { ${jsImport(root, "value.mjs")} }. 3 add: .`,
      "%js(globalThis.__tossImportProbe ?? 0).",
    ],
  });
  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> 0\n");
  assert.match(text(result.stderr), /SyntaxError/);
});

Deno.test("CLI JS load failure rolls back candidate macros and Toss module records", async () => {
  const result = await runFixture({
    files: { "value.toss": "%export(11)." },
    input: (root) => [
      `%macro(#answer, { s -> %quote(1) }). %import('./value.toss'). ${
        jsImport(root, "missing.mjs")
      }.`,
      "%answer().",
      "%js(Deno.writeTextFileSync('value.toss', '%export(22).')).",
      "%import('./value.toss').",
      "7.",
    ],
  });
  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> nil\n=> 22\n=> 7\n");
  assert.match(text(result.stderr), /missing\.mjs/);
  assert.match(text(result.stderr), /<repl>:1:/);
  assert.match(text(result.stderr), /Macro %answer is not defined/);
});

Deno.test("CLI drains delayed imports and ordered reset before quit", async () => {
  const result = await runFixture({
    files: {
      "slow.mjs":
        "await new Promise(r => setTimeout(r, 50)); console.log('ready'); export const answer = 7;",
    },
    input: (root) => [
      `#slow bind: ${jsImport(root, "slow.mjs")}.`,
      "%js(module = $slow; module.answer).",
      ":reset",
      "$slow.",
      "8.",
      ":quit",
      "'never' print.",
    ],
  });
  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "ready\n=> <js>\n=> 7\n=> 8\n");
  assert.match(text(result.stderr), /Unbound name "slow"/);
});

Deno.test("CLI dynamic imports use the configured Hono import alias", async () => {
  const result = await runFixture({
    files: {},
    input: () => [
      "#hono bind: %jsImport('hono').",
      "%js(module = $hono; typeof module.Hono).",
    ],
  });
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), '=> <js>\n=> "function"\n');
});

Deno.test("CLI retains host dependency effects when a later JS dependency fails", async () => {
  const result = await runFixture({
    files: {
      "first.mjs": "console.log('first'); export const answer = 7;",
      "failure.mjs": "throw new Error('load-failure');",
    },
    input: (root) => [
      `'never' print. ${jsImport(root, "first.mjs")}. ${
        jsImport(root, "failure.mjs")
      }.`,
      "7.",
      `${jsImport(root, "first.mjs")}.`,
    ],
  });
  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "first\n=> 7\n=> <js>\n");
  assert.match(text(result.stderr), /load-failure/);
});

Deno.test("CLI recovers when JS module evaluation throws an object without a prototype", async () => {
  const result = await runFixture({
    files: { "failure.mjs": "throw Object.create(null);" },
    input: (root) => [`${jsImport(root, "failure.mjs")}.`, "7."],
  });
  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> 7\n");
  assert.match(text(result.stderr), /Unable to load JavaScript module/);
  assert.doesNotMatch(
    text(result.stderr),
    /Uncaught|TypeError: Cannot convert/,
  );
});

Deno.test("CLI JS dependencies keep entry-first file traversal order", async () => {
  const result = await runFixture({
    files: {
      "root.mjs": "console.log('root'); export const answer = 1;",
      "parent.mjs": "console.log('parent'); export const answer = 2;",
      "child.mjs": "console.log('child'); export const answer = 3;",
    },
    input: (root) => {
      const parent = `%import('./child.toss'). %export({ ${
        jsImport(root, "parent.mjs")
      } }).`;
      const child = `%export({ ${jsImport(root, "child.mjs")} }).`;
      return [
        `%js((Deno.writeTextFileSync('parent.toss', ${
          JSON.stringify(parent)
        }), Deno.writeTextFileSync('child.toss', ${JSON.stringify(child)}))).`,
        `${jsImport(root, "root.mjs")}. { %import('./parent.toss') }.`,
      ];
    },
  });
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(
    text(result.stdout),
    "=> nil\nroot\nparent\nchild\n=> <block>\n",
  );
});
