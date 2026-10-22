import assert from "node:assert/strict";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { flattenSyntax } from "../src/syntax_flatten.ts";
import { readSyntax } from "../src/syntax_reader.ts";

const read = (source: string) => readSyntax(source, { file: "reader.toss" });

Deno.test("reads nested Toss groups and preserves token spelling", () => {
  const tree = read("%custom($value, #key, -0.50, 'it\\'s', $(1 + (2))).");
  assert.equal(tree.kind, "group");
  assert.deepEqual(
    flattenSyntax(tree).source,
    "%custom($value,#key,-0.50,'it\\'s',$(1+ (2))) .",
  );
  assert.equal(tree.children[0]?.kind, "token");
  assert.equal(
    tree.children[0]?.kind === "token" ? tree.children[0].flavor : "",
    "macro",
  );
});

Deno.test("keeps locations, caller scope, and omits comments", () => {
  const tree = read("// comment\n$thing.");
  const fetch = tree.children[0];
  assert.equal(fetch?.kind, "token");
  assert.deepEqual(fetch?.origin.location, {
    file: "reader.toss",
    line: 2,
    column: 1,
  });
  assert.deepEqual(fetch?.origin.scope, { kind: "caller", id: 0 });
  if (tree.kind === "group") {
    assert.notEqual(tree.children, tree.children);
  }
});

Deno.test("keeps JavaScript opaque and exposes Toss prefix holes", () => {
  const tree = read("%js(x = %,($value); x + /[,)]/.test('x'))");
  const token = tree.children[0];
  assert.equal(token?.kind, "token");
  if (token?.kind !== "token") return;
  assert.equal(token.flavor, "rawJavaScript");
  assert.equal(token.rawJavaScript?.source, "x + /[,)]/.test('x')");
  assert.equal(token.rawJavaScript?.prefix[0]?.kind, "token");
});

Deno.test("recognizes quotation, quasiquotation, unquote and splice markers", () => {
  const tree = read("%quote(%`(%,(x) %,@(xs)))");
  const tokens = collectTokens(tree);
  assert.deepEqual(
    tokens.map((token) => token.flavor),
    ["macro", "quasiquote", "unquote", "ordinary", "splice", "ordinary"],
  );
});

Deno.test("preserves adjacency and arithmetic comparison tokens", () => {
  const adjacent = read("%id(1)").children[0];
  const spaced = read("%id (1)").children[0];
  assert.equal(adjacent?.kind === "token" && adjacent.macroAdjacent, true);
  assert.equal(spaced?.kind === "token" && spaced.macroAdjacent, false);
  assert.deepEqual(
    flattenSyntax(read("$(1 < 2, 2 <= 3, 3 > 2, 3 >= 2, 1 == 1, 1 != 2)"))
      .source,
    "$(1<2,2<=3,3>2,3>=2,1==1,1!=2)",
  );
});

function collectTokens(
  node: import("../src/syntax.ts").SyntaxNode,
): readonly import("../src/syntax.ts").SyntaxToken[] {
  if (node.kind === "token") return [node];
  return node.children.flatMap(collectTokens);
}

Deno.test("rejects mismatched and unterminated syntax at the source location", () => {
  assert.throws(
    () => read("([)]"),
    (error: unknown) =>
      error instanceof TossSyntaxError && error.location.column === 3,
  );
  assert.throws(
    () => read("'unfinished"),
    (error: unknown) =>
      error instanceof TossSyntaxError && error.location.column === 1,
  );
  assert.throws(() => read("(1"), TossSyntaxError);
});
