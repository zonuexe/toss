import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, text } from "./helpers.ts";

const outputCases = [
  { name: "hello", source: "'Hello, Toss!' print.", output: "Hello, Toss!\n" },
  {
    name: "receiver chaining",
    source: "'World' print print.",
    output: "World\nWorld\n",
  },
  { name: "empty file", source: "", output: "" },
  { name: "unused value", source: "'Unused value'.", output: "" },
  { name: "empty string", source: "'' print.", output: "\n" },
  {
    name: "multiple statements",
    source: "'A' print. 'B' print.",
    output: "A\nB\n",
  },
  {
    name: "comments and whitespace",
    source: "// start\r\n\t'Hello' // middle\n print\n. // end",
    output: "Hello\n",
  },
  {
    name: "minimal escapes",
    source: String.raw`'can\'t \\ escape' print.`,
    output: "can't \\ escape\n",
  },
  {
    name: "literal backslashes",
    source: String.raw`'\n\r\t\q' print.`,
    output: "\\n\\r\\t\\q\n",
  },
  {
    name: "literal control characters",
    source: "'a\tb\r\nc\nd' print.",
    output: "a\tb\r\nc\nd\n",
  },
  {
    name: "literal syntax characters",
    source: "'// print. ${notCode} ` \\" + '"' + "' print.",
    output: '// print. ${notCode} ` \\"\n',
  },
  {
    name: "Unicode string",
    source: "'こんにちは ⚾' print.",
    output: "こんにちは ⚾\n",
  },
] as const;

for (const fixture of outputCases) {
  Deno.test(`outputs correctly when source contains ${fixture.name}`, async () => {
    const result = await execute(fixture.source);

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), fixture.output);
    assert.equal(text(result.stderr), "");
  });
}

const invalidCases = [
  { source: "'hello' print", line: 1, column: 14, reason: "Expected '.'" },
  { source: "'hello", line: 1, column: 1, reason: "Unterminated string" },
  { source: "'hello\\'", line: 1, column: 1, reason: "Unterminated string" },
  {
    source: '"hello" print.',
    line: 1,
    column: 1,
    reason: "Unexpected character",
  },
  { source: "'a'.\r\n$.", line: 2, column: 2, reason: "Expected a name" },
  {
    source: "'a' print:.",
    line: 1,
    column: 11,
    reason: "Expected an expression",
  },
  { source: "'a' 表示.", line: 1, column: 5, reason: "Unexpected character" },
  {
    source: "/* comment */",
    line: 1,
    column: 1,
    reason: "Unexpected character",
  },
  { source: "('a'.).", line: 1, column: 5, reason: "Expected ')'" },
  { source: "'a'\n'b'.", line: 2, column: 1, reason: "Expected '.'" },
] as const;

for (const fixture of invalidCases) {
  Deno.test(`rejects invalid syntax ${JSON.stringify(fixture.source)}`, () => {
    assert.throws(
      () => compile(fixture.source, "invalid.toss"),
      (error: unknown) => {
        assert.ok(error instanceof TossSyntaxError);
        assert.deepEqual(error.location, {
          file: "invalid.toss",
          line: fixture.line,
          column: fixture.column,
        });
        assert.ok(error.message.includes(fixture.reason));
        return true;
      },
    );
  });
}

for (
  const name of [
    "missing",
    "Print",
    "constructor",
    "hasOwnProperty",
    "__proto__",
    "class",
    "_x1",
  ]
) {
  Deno.test(`fails at runtime when the message is ${name}`, async () => {
    const result = await execute(`'World' print ${name}. 'unreachable' print.`);

    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "World\n");
    assert.ok(
      text(result.stderr).includes(
        `fixture.toss:1:15: RuntimeError: Unknown message "${name}"`,
      ),
    );
    assert.ok(!text(result.stderr).includes("program.js:"));
  });
}

Deno.test("reports original positions after Unicode and multiline strings", async () => {
  const source = "'⚾\r\nこんにちは'\r\n  missing.";

  const result = await execute(source);

  assert.notEqual(result.code, 0);
  assert.ok(text(result.stderr).includes("fixture.toss:3:3: RuntimeError"));
});
