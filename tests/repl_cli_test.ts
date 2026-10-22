import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { IncompleteJavaScriptError } from "../src/diagnostic.ts";
import { text } from "./helpers.ts";

async function runRepl(input: string): Promise<Deno.CommandOutput> {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-prompt",
      "--allow-read",
      "--allow-write",
      "src/repl_cli.ts",
    ],
    cwd: Deno.cwd(),
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(input));
  await writer.close();
  return await child.output();
}

Deno.test("batch REPL evaluates cells once and prints only results", async () => {
  const result = await runRepl([
    "#count bind: 0.",
    "%js(globalThis.__tossReplCount = 0).",
    "%js(globalThis.__tossReplCount += 1).",
    "%js(globalThis.__tossReplCount).",
    "'printed' print.",
  ].join("\n"));
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(
    text(result.stdout),
    '=> 0\n=> 0\n=> 1\n=> 1\nprinted\n=> "printed"\n',
  );
  assert.equal(text(result.stderr), "");
});

Deno.test("multiline cells, commands, and recovery work in batch input", async () => {
  const result = await runRepl([
    "#read bind: {",
    "  #value bind: [1,",
    "    2].",
    "  $value",
    "}.",
    ":help",
    "$read value.",
    "$missing.",
    "9.",
    ":quit",
    "10.",
  ].join("\n"));
  assert.equal(result.code, 1);
  assert.match(text(result.stdout), /Toss REPL commands:/);
  assert.match(text(result.stderr), /Unknown message "inspect" for Block/);
  assert.match(text(result.stdout), /=> \[1, 2\]/);
  assert.match(text(result.stdout), /=> 9/);
  assert.doesNotMatch(text(result.stdout), /=> 10/);
  assert.match(text(result.stderr), /Unbound name "missing"/);
});

Deno.test("multiline JavaScript expressions continue from parser EOF metadata", async () => {
  const result = await runRepl([
    "%js((() => {",
    "  return 4;",
    "})()).",
  ].join("\n"));
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "=> 4\n");
  assert.equal(text(result.stderr), "");
});

Deno.test("JavaScript expressions continue when the macro closer is on the next line", async () => {
  const result = await runRepl("%js(1\n).\n%js(value = 1; value + 1\n).\n");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "=> 1\n=> 2\n");
  assert.equal(text(result.stderr), "");
});

Deno.test("JavaScript expression operators continue at parser EOF", async () => {
  const result = await runRepl("%js(1 +\n2).\n");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "=> 3\n");
  assert.equal(text(result.stderr), "");
});

Deno.test("invalid JavaScript tokens diagnose and allow later cells", async () => {
  const result = await runRepl("%js(@).\n7.\n");
  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> 7\n");
  assert.match(text(result.stderr), /Invalid %js expression/);
});

Deno.test("a CRLF split across input chunks creates no empty cell", async () => {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "--no-prompt", "src/repl_cli.ts"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    signal: AbortSignal.timeout(2000),
  });
  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode("1.\r"));
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  await writer.write(new TextEncoder().encode("\n2.\r\n"));
  await writer.close();
  const result = await child.output();
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "=> 1\n=> 2\n");
  assert.equal(text(result.stderr), "");
});

Deno.test("quit returns while the input stream remains open", async () => {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "--no-prompt", "src/repl_cli.ts"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    signal: AbortSignal.timeout(2000),
  });
  const child = command.spawn();
  await child.stdin.getWriter().write(new TextEncoder().encode(":quit\n"));
  const result = await child.output();
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "");
  assert.equal(text(result.stderr), "");
});

Deno.test("file compilation still rejects incomplete JavaScript strictly", () => {
  assert.throws(
    () => compile("%js(`unfinished", "strict.toss"),
    IncompleteJavaScriptError,
  );
});

Deno.test("multiline Toss strings retain their contents", async () => {
  const result = await runRepl(["'two", "lines'."].join("\n"));
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), '=> "two\\nlines"\n');
});

Deno.test("cancel and reset discard pending code and state", async () => {
  const result = await runRepl([
    "#x bind: {",
    ":cancel",
    "#x bind: 1.",
    ":reset",
    "$x.",
    "2.",
  ].join("\n"));
  assert.equal(result.code, 1);
  assert.match(text(result.stdout), /=> 1/);
  assert.match(text(result.stdout), /=> 2/);
  assert.match(text(result.stderr), /Unbound name "x"/);
});

Deno.test("syntax errors recover, EOF rejects pending input, and errors set batch status", async () => {
  const failed = await runRepl("'broken' add:.\n7.\n");
  assert.equal(failed.code, 1);
  assert.match(text(failed.stdout), /=> 7/);
  assert.match(text(failed.stderr), /SyntaxError/);

  const eof = await runRepl("{ 1\n");
  assert.equal(eof.code, 1);
  assert.equal(text(eof.stdout), "");
  assert.match(text(eof.stderr), /incomplete input at end of file/);
});
