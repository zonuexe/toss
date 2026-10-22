import assert from "node:assert/strict";
import { text } from "./helpers.ts";

Deno.test("interactive JavaScript retains multiline templates and block comments", async () => {
  const source = [
    "%js(`first",
    "second`).",
    "%js((() => { /* a multiline",
    "comment containing ). */ return 8; })()).",
  ].join("\n");

  const result = await runInput(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), '=> "first\\nsecond"\n=> 8\n');
});

Deno.test("interactive JavaScript waits for its outer closing parenthesis", async () => {
  const source = "%js(1\n).\n%js(x = 2; x\n).\n%js(1 +\n2).\n";

  const result = await runInput(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "=> 1\n=> 2\n=> 3\n");
});

Deno.test("interactive invalid JavaScript recovers instead of waiting forever", async () => {
  const source = "%js(@).\n9.\n";

  const result = await runInput(source);

  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> 9\n");
  assert.match(text(result.stderr), /SyntaxError/);
});

Deno.test("interactive JavaScript templates retain interpolation across lines", async () => {
  const source = [
    "%js(`first ${1}",
    "second ${2}",
    "third`).",
    "%js(`sum ${",
    "1 + 2",
    "}`).",
  ].join("\n");

  const result = await runInput(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(
    text(result.stdout),
    '=> "first 1\\nsecond 2\\nthird"\n=> "sum 3"\n',
  );
});

async function runInput(input: string): Promise<Deno.CommandOutput> {
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "--no-prompt", "src/repl_cli.ts"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    signal: AbortSignal.timeout(5000),
  }).spawn();
  const writer = child.stdin.getWriter();
  try {
    await writer.write(new TextEncoder().encode(input));
  } finally {
    await writer.close();
  }
  return await child.output();
}

Deno.test("interactive cells execute prior output only once", async () => {
  const input = "'once' print.\n2.\n3.\n:quit\n'never' print.\n";

  const result = await runInput(input);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), 'once\n=> "once"\n=> 2\n=> 3\n');
  assert.equal(text(result.stderr), "");
});

Deno.test("interactive fatal evaluation errors do not become successful exits", async () => {
  const input = "#loop bind: { $loop value }. 0.\n$loop value.\n";

  const result = await runInput(input);

  assert.equal(result.code, 1);
  assert.match(text(result.stderr), /RangeError|call stack/i);
  assert.doesNotMatch(text(result.stderr), /incomplete input at end of file/);
});

Deno.test("interactive runtime failure keeps earlier effects and resumes", async () => {
  const input = "#n bind: 1.\n#n bind: 2. $missing.\n$n.\n";

  const result = await runInput(input);

  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> 1\n=> 2\n");
  assert.match(text(result.stderr), /Unbound name "missing"/);
  assert.match(text(result.stderr), /<repl>:2:/);
});

Deno.test("interactive syntax failure commits neither binds nor macros", async () => {
  const input = [
    "#n bind: 1.",
    "%macro(#fresh, { s -> $s }). #n bind: 2. 3 add: .",
    "$n.",
    "%fresh(7).",
    "4.",
    "",
  ].join("\n");

  const result = await runInput(input);

  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> 1\n=> 1\n=> 4\n");
  assert.match(text(result.stderr), /Macro %fresh is not defined/);
});

Deno.test("interactive completeness uses Toss and JavaScript lexical boundaries", async () => {
  const input = [
    "'line one",
    "line two'.",
    "[1,",
    "2].",
    "%js((() => {",
    "  // A comment with ). does not close the macro.",
    "  return /[).]/.test(')');",
    "})()).",
    "",
  ].join("\n");

  const result = await runInput(input);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(
    text(result.stdout),
    '=> "line one\\nline two"\n=> [1, 2]\n=> true\n',
  );
});

Deno.test("interactive help preserves pending input", async () => {
  const input = "{\n:help\n42\n} value.\n";

  const result = await runInput(input);

  assert.equal(result.code, 0, text(result.stderr));
  assert.match(text(result.stdout), /:quit/);
  assert.match(text(result.stdout), /=> 42\n$/);
});

Deno.test("interactive EOF never executes an incomplete cell", async () => {
  const input = "'no-execute' print. {\n";

  const result = await runInput(input);

  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "");
  assert.match(
    text(result.stderr),
    /incomplete|Incomplete|Unclosed|Unterminated/,
  );
});

for (
  const [name, expression] of [
    ["file import", "{ %import('./missing.toss') }"],
    ["JS import", "{ %jsImport('npm:missing-repl-fixture') }"],
    ["macro import", "{ %macroImport('./missing.toss') }"],
    ["export", "{ %export(1) }"],
  ] as const
) {
  Deno.test(`interactive rejects ${name} before any cell effects`, async () => {
    const input = `'never' print. ${expression}.\n7.\n`;

    const result = await runInput(input);

    assert.equal(result.code, 1);
    assert.equal(text(result.stdout), "=> 7\n");
    assert.match(text(result.stderr), /REPL|file-root|top-level/);
  });
}
