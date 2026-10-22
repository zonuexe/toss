import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { MacroState } from "../src/macro_value.ts";
import { appendSyntaxTrace } from "../src/syntax_trace.ts";
import { syntaxGroup, type SyntaxNode, syntaxToken } from "../src/syntax.ts";

const location = { file: "trace-limit.toss", line: 1, column: 1 };
const origin = {
  location,
  scope: { kind: "caller" as const, id: 0 },
  trace: [],
};

Deno.test("moderate generated syntax compiles", () => {
  assert.doesNotThrow(() =>
    compile(
      "%macro(#generated, { s -> %quote([1]) }). %generated().",
      "small.toss",
    )
  );
});

Deno.test("syntax trace rejects excessive nesting before stack overflow", () => {
  let node: SyntaxNode = syntaxToken("leaf", origin);
  for (let depth = 0; depth < 129; depth++) {
    node = syntaxGroup("[]", [node], origin);
  }
  assert.throws(
    () => appendSyntaxTrace([node], [], new MacroState()),
    (error: unknown) =>
      error instanceof TossSyntaxError &&
      /syntax depth limit/.test(error.reason),
  );
});

Deno.test("syntax trace meters repeated visits to shared syntax nodes", () => {
  let node: SyntaxNode = syntaxToken("leaf", origin);
  for (let depth = 0; depth < 17; depth++) {
    node = syntaxGroup("[]", [node, node], origin);
  }
  assert.throws(
    () => appendSyntaxTrace([node], [], new MacroState()),
    (error: unknown) =>
      error instanceof TossSyntaxError &&
      /computation limit/.test(error.reason),
  );
});
