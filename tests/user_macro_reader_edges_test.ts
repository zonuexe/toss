import assert from "node:assert/strict";
import { parse } from "../src/parser.ts";
import { flattenSyntax } from "../src/syntax_flatten.ts";
import { readSyntax } from "../src/syntax_reader.ts";

Deno.test("syntax flattening does not merge statement periods into a decimal", () => {
  const tree = readSyntax("1. 2.", { file: "roundtrip.toss" });
  const expressions = parse(flattenSyntax(tree).source, "roundtrip.toss");
  assert.equal(expressions.length, 2);
  assert.equal(expressions[0]?.kind, "number");
  assert.equal(expressions[1]?.kind, "number");
});

for (const newline of ["\r", "\r\n", "\n"]) {
  Deno.test(`syntax locations preserve ${JSON.stringify(newline)} lines`, () => {
    const tree = readSyntax(`1.${newline}2.`, { file: "lines.toss" });
    assert.deepEqual(tree.children[2]?.origin.location, {
      file: "lines.toss",
      line: 2,
      column: 1,
    });
  });
}

Deno.test("syntax flattening does not turn separate slash tokens into a comment", () => {
  const tree = readSyntax("$(1 / / 2).", { file: "tokens.toss" });
  const restored = readSyntax(flattenSyntax(tree).source, {
    file: "tokens.toss",
  });
  const group = restored.children[0];
  assert.equal(group?.kind, "group");
  if (group?.kind === "group") assert.equal(group.children.length, 4);
});
