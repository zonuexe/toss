import assert from "node:assert/strict";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { parseSyntax } from "../src/syntax_tokens.ts";
import type { SyntaxNode } from "../src/syntax.ts";

Deno.test("parseSyntax returns literal quotation data without parsing its body", () => {
  const expressions = parseSyntax("%quote(1 2).");

  assert.equal(expressions.length, 1);
  const expression = expressions[0];
  assert.equal(expression?.kind, "quotation");
  if (expression?.kind !== "quotation") return;
  assert.equal(expression.mode, "literal");
  assert.equal(expression.syntax.delimiter, "");
  assert.deepEqual(
    expression.syntax.children.map((node) =>
      node.kind === "token" ? node.spelling : node.delimiter
    ),
    ["1", "2"],
  );
});

Deno.test("parseSyntax preserves quasiquote and nested unquote syntax", () => {
  const expressions = parseSyntax("%`([%,($value), %`(%,($nested))]).");

  const expression = expressions[0];
  assert.equal(expression?.kind, "quotation");
  if (expression?.kind !== "quotation") return;
  assert.equal(expression.mode, "quasi");
  assert.deepEqual(collectFlavors(expression.syntax.children), [
    "unquote",
    "fetch",
    "ordinary",
    "quasiquote",
    "unquote",
    "fetch",
  ]);
});

Deno.test("parseSyntax accepts quotation in a one-parameter block body", () => {
  const expressions = parseSyntax("{ syntax -> %quote($syntax) }.");

  const expression = expressions[0];
  assert.equal(expression?.kind, "block");
  if (expression?.kind !== "block") return;
  assert.deepEqual(expression.parameters, ["syntax"]);
  assert.equal(expression.body[0]?.kind, "quotation");
});

Deno.test("parseSyntax accepts quotation as a keyword and pipeline argument", () => {
  const expressions = parseSyntax(
    "$object put: %quote(value). 1 |> $object put: %quote(input) at:.",
  );

  assert.equal(expressions[0]?.kind, "send");
  assert.equal(expressions[1]?.kind, "pipeline");
  if (expressions[0]?.kind === "send") {
    assert.equal(expressions[0].arguments[0]?.kind, "quotation");
  }
  if (expressions[1]?.kind === "pipeline") {
    assert.equal(expressions[1].arguments[0]?.kind, "quotation");
  }
});

Deno.test("parseSyntax converts ordinary Toss, arithmetic, and built-in forms", () => {
  const expressions = parseSyntax("$value add: $(1 + 2). %super().");

  assert.equal(expressions.length, 2);
  assert.equal(expressions[0]?.kind, "send");
  assert.equal(expressions[1]?.kind, "super");
  if (expressions[0]?.kind !== "send") return;
  assert.equal(expressions[0].name, "add:");
  assert.equal(expressions[0].arguments[0]?.kind, "send");
});

Deno.test("parseSyntax retains source locations for quotation and parsed expressions", () => {
  const expressions = parseSyntax("1.\n%quote($value).", {
    file: "source.toss",
  });

  assert.deepEqual(expressions[0]?.location, {
    file: "source.toss",
    line: 1,
    column: 1,
  });
  assert.deepEqual(expressions[1]?.location, {
    file: "source.toss",
    line: 2,
    column: 1,
  });
  if (expressions[1]?.kind !== "quotation") return;
  assert.deepEqual(expressions[1].syntax.children[0]?.origin.location, {
    file: "source.toss",
    line: 2,
    column: 8,
  });
});

Deno.test("parseSyntax rejects unquote markers outside quotation", () => {
  assert.throws(
    () => parseSyntax("%,(1).", { file: "unquote.toss" }),
    (error: unknown) =>
      error instanceof TossSyntaxError && error.location.column === 1,
  );
});

function collectFlavors(nodes: readonly SyntaxNode[]): readonly string[] {
  return nodes.flatMap((node) =>
    node.kind === "token" ? [node.flavor] : collectFlavors(node.children)
  );
}
