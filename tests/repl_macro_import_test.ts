import assert from "node:assert/strict";
import { createReplSession } from "../src/repl.ts";
import { text } from "./helpers.ts";

Deno.test("REPL imports macros at their root source position", async () => {
  const directory = await libraryDirectory(
    "%macro(#answer, { s -> %quote(42) }).",
  );
  try {
    await Deno.symlink("macros.toss", `${directory}/alias.toss`);
    const session = createReplSession({ baseDirectory: directory });
    assert.equal(session.submit("%answer().").kind, "error");
    assert.deepEqual(
      session.submit("%macroImport('./macros.toss'). %answer()."),
      { kind: "value", display: "42" },
    );
    assert.deepEqual(
      session.submit("%macroImport('././macros.toss')."),
      { kind: "empty" },
    );
    assert.deepEqual(
      session.submit("%macroImport('./alias.toss')."),
      { kind: "empty" },
    );
    assert.deepEqual(session.submit("%answer()."), {
      kind: "value",
      display: "42",
    });
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("failed REPL compilation commits neither imported macros nor cache", async () => {
  const directory = await libraryDirectory(
    "%macro(#answer, { s -> %quote(1) }).",
  );
  try {
    const session = createReplSession({ baseDirectory: directory });
    const failed = session.submit(
      "%macroImport('./macros.toss'). #ran bind: true. 'bad' add:.",
    );
    assert.equal(failed.kind, "error");
    assert.equal(session.submit("$ran.").kind, "error");

    await Deno.writeTextFile(
      `${directory}/macros.toss`,
      "%macro(#answer, { s -> %quote(2) }).",
    );
    assert.deepEqual(
      session.submit("%macroImport('./macros.toss'). %answer()."),
      { kind: "value", display: "2" },
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("REPL reset reloads libraries and sessions keep independent caches", async () => {
  const directory = await libraryDirectory(
    "%macro(#answer, { s -> %quote(1) }).",
  );
  try {
    const first = createReplSession({ baseDirectory: directory });
    const second = createReplSession({ baseDirectory: directory });
    assert.equal(first.submit("%macroImport('./macros.toss').").kind, "empty");
    await Deno.writeTextFile(
      `${directory}/macros.toss`,
      "%macro(#answer, { s -> %quote(2) }).",
    );
    assert.deepEqual(first.submit("%answer()."), {
      kind: "value",
      display: "1",
    });
    assert.equal(second.submit("%macroImport('./macros.toss').").kind, "empty");
    assert.deepEqual(second.submit("%answer()."), {
      kind: "value",
      display: "2",
    });

    first.reset();
    assert.equal(first.submit("%macroImport('./macros.toss').").kind, "empty");
    assert.deepEqual(first.submit("%answer()."), {
      kind: "value",
      display: "2",
    });
    assert.equal(first.submit("$answer.").kind, "error");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("REPL imports preserve library helpers, consumer roots, and hygiene", async () => {
  const directory = await libraryDirectory(
    "%macro(#helper, { s -> $s }). %macro(#root, { s -> %quote($offset) }). %macro(#local, { s -> %`({ #temp bind: 2. (%,($s)) add: $temp } value) }). %macro(#outer, { s -> %helper(%quote(7)) }).",
  );
  try {
    const session = createReplSession({ baseDirectory: directory });
    assert.deepEqual(
      session.submit(
        "#offset bind: 40. #temp bind: 10. %macroImport('./macros.toss'). %outer().",
      ),
      { kind: "value", display: "7" },
    );
    assert.deepEqual(session.submit("%root()."), {
      kind: "value",
      display: "40",
    });
    assert.deepEqual(session.submit("%local(3)."), {
      kind: "value",
      display: "5",
    });
    assert.deepEqual(session.submit("$temp."), {
      kind: "value",
      display: "10",
    });
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("REPL import failures are positioned and do not retain declarations", async () => {
  const directory = await libraryDirectory("#runtime bind: 1.");
  try {
    const session = createReplSession({ baseDirectory: directory });
    session.submit("1.\n");
    const invalid = session.submit("%macroImport('./macros.toss').");
    assert.equal(invalid.kind, "error");
    assert.match(invalid.message, /:1:1: SyntaxError/);
    assert.match(invalid.message, /only standalone %macro declarations/);
    const missing = session.submit("%macroImport('./missing.toss').");
    assert.equal(missing.kind, "error");
    assert.match(missing.message, /<repl>:3:1: SyntaxError/);
    assert.match(missing.message, /Macro library not found/);
    assert.equal(session.submit("%runtime().").kind, "error");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("runtime failures keep committed imports and namespace conflicts recover", async () => {
  const directory = await libraryDirectory(
    "%macro(#answer, { s -> %quote(42) }).",
  );
  try {
    await Deno.writeTextFile(
      `${directory}/builtins.toss`,
      "%macro(#quote, { s -> $s }).",
    );
    const session = createReplSession({ baseDirectory: directory });
    const conflict = session.submit("%macro(#answer, { s -> $s }).");
    assert.equal(conflict.kind, "empty");
    const duplicate = session.submit("%macroImport('./macros.toss').");
    assert.equal(duplicate.kind, "error");
    assert.match(duplicate.message, /Duplicate macro %answer/);
    assert.deepEqual(session.submit("%answer(8)."), {
      kind: "value",
      display: "8",
    });

    const builtin = session.submit("%macroImport('./builtins.toss').");
    assert.equal(builtin.kind, "error");
    assert.match(builtin.message, /Cannot replace built-in macro %quote/);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("runtime errors leave successful macro imports available", async () => {
  const directory = await libraryDirectory(
    "%macro(#answer, { s -> %quote(42) }).",
  );
  try {
    const session = createReplSession({ baseDirectory: directory });
    const failure = session.submit(
      "%macroImport('./macros.toss'). $missing.",
    );
    assert.equal(failure.kind, "error");
    assert.match(failure.message, /Unbound name "missing"/);
    assert.deepEqual(session.submit("%answer()."), {
      kind: "value",
      display: "42",
    });
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("REPL rejects nested and generated imports while quoted unused imports stay inert", async () => {
  const directory = await libraryDirectory(
    "%macro(#unused, { s -> %quote(%macroImport('./missing.toss')) }). %macro(#inject, { s -> %quote(%macroImport('./missing.toss')) }).",
  );
  try {
    const session = createReplSession({ baseDirectory: directory });
    assert.equal(
      session.submit("%macroImport('./macros.toss').").kind,
      "empty",
    );
    const nested = session.submit(
      "#block bind: { %macroImport('./missing.toss') }.",
    );
    assert.equal(nested.kind, "error");
    assert.match(nested.message, /standalone REPL cell-root directive/);
    const generated = session.submit("%inject().");
    assert.equal(generated.kind, "error");
    assert.match(generated.message, /cannot be generated/);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("REPL keeps JS imports, cell exports, and root await unavailable", () => {
  const session = createReplSession();
  for (
    const source of [
      "%jsImport('missing').",
      "%export(1).",
      "%await(1).",
    ]
  ) {
    assert.equal(session.submit(source).kind, "error");
  }
});

Deno.test("REPL CLI silently accepts an import-only cell and expands the next cell", async () => {
  const directory = await libraryDirectory(
    "%macro(#answer, { s -> %quote(42) }).",
  );
  try {
    const child = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--no-prompt",
        "--allow-read",
        `${Deno.cwd()}/src/repl_cli.ts`,
      ],
      cwd: directory,
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });
    const process = child.spawn();
    const writer = process.stdin.getWriter();
    await writer.write(
      new TextEncoder().encode(
        "%js((() => { Deno.chdir('/'); return 1; })()).\n:reset\n%macroImport('./macros.toss').\n%answer().\n",
      ),
    );
    await writer.close();
    const result = await process.output();
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "=> 1\n=> 42\n");
    assert.equal(text(result.stderr), "");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

async function libraryDirectory(source: string): Promise<string> {
  const directory = await Deno.makeTempDir({ prefix: "toss-repl-macro-" });
  await Deno.writeTextFile(`${directory}/macros.toss`, source);
  return directory;
}
