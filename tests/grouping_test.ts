import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, text } from "./helpers.ts";

const cases = [
  { name: "grouped literal", source: "('Hello') print.", output: "Hello\n" },
  {
    name: "grouped binding result",
    source: "(#greeting bind: 'Hello') print.",
    output: "Hello\n",
  },
  {
    name: "nested keyword send",
    source:
      "#copy bind: (#greeting bind: 'Goodbye'). $copy print. $greeting print.",
    output: "Goodbye\nGoodbye\n",
  },
  {
    name: "nested groups",
    source: "(((#x bind: ('Hello')))) print.",
    output: "Hello\n",
  },
  {
    name: "shared environment",
    source: "#x bind: 'before'. (#x bind: 'after') print. $x print.",
    output: "after\nafter\n",
  },
  {
    name: "grouped symbol receiver",
    source: "(#key bind: #greeting) bind: 'Hello'. $greeting print.",
    output: "Hello\n",
  },
  {
    name: "grouped fetch",
    source: "#x bind: 'Hello'. ($x) dump.",
    output: '"Hello"\n',
  },
  {
    name: "messages after group",
    source: "(#x bind: 'Hello') inspect print.",
    output: '"Hello"\n',
  },
  {
    name: "comments and newlines",
    source: "( // open\r\n #x bind: 'Hello' // value\r\n) print.",
    output: "Hello\n",
  },
  {
    name: "parentheses inside strings",
    source: "'() // (' print.",
    output: "() // (\n",
  },
] as const;

for (const fixture of cases) {
  Deno.test(`supports ${fixture.name}`, async () => {
    const result = await execute(fixture.source);

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), fixture.output);
    assert.equal(text(result.stderr), "");
  });
}

const invalidCases = [
  { source: "().", column: 2, reason: "Expected an expression" },
  {
    source: "( // empty\n).",
    line: 2,
    column: 1,
    reason: "Expected an expression",
  },
  { source: "('a'.).", column: 5, reason: "Expected ')'" },
  { source: "('a'. 'b').", column: 5, reason: "Expected ')'" },
  { source: "('a'", column: 5, reason: "Expected ')'" },
  { source: "(('a').", column: 7, reason: "Expected ')'" },
  { source: "'a').", column: 4, reason: "Expected '.'" },
  { source: ").", column: 1, reason: "Expected an expression" },
  { source: "('a')", column: 6, reason: "Expected '.'" },
] as const;

for (const fixture of invalidCases) {
  Deno.test(`rejects malformed grouping ${JSON.stringify(fixture.source)}`, () => {
    assert.throws(
      () => compile(fixture.source, "group.toss"),
      (error: unknown) => {
        assert.ok(error instanceof TossSyntaxError);
        assert.equal(error.location.file, "group.toss");
        assert.equal(error.location.line, "line" in fixture ? fixture.line : 1);
        assert.equal(error.location.column, fixture.column);
        assert.ok(error.message.includes(fixture.reason), error.message);
        return true;
      },
    );
  });
}

Deno.test("keeps the original location of an unbound reference inside a group", async () => {
  const result = await execute("(\r\n  $missing\r\n) print.");

  assert.notEqual(result.code, 0);
  assert.ok(
    text(result.stderr).includes(
      'fixture.toss:2:3: RuntimeError: Unbound name "missing".',
    ),
  );
});

Deno.test("keeps the original location of a message after a group", async () => {
  const result = await execute("('a') missing.");

  assert.notEqual(result.code, 0);
  assert.ok(
    text(result.stderr).includes(
      'fixture.toss:1:7: RuntimeError: Unknown message "missing"',
    ),
  );
});

Deno.test("evaluates grouped keyword arguments in source order", async () => {
  const result = await execute(
    "#x bind: 'before'. 'receiver' print at: (#x bind: 'first' print) put: $x print.",
  );

  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "receiver\nfirst\nfirst\n");
  assert.ok(text(result.stderr).includes('Unknown message "at:put:"'));
});
