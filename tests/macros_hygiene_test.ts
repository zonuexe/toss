import assert from "node:assert/strict";
import { parseSyntax } from "../src/syntax_tokens.ts";
import { execute, text } from "./helpers.ts";

Deno.test("AST locations preserve nonzero macro scopes on binders and fetches", () => {
  const expressions = parseSyntax("{ value -> $value }.", {
    file: "scope.toss",
    scope: { kind: "introduced", id: 12 },
  });
  const block = expressions[0];
  assert.ok(block?.kind === "block");
  if (block?.kind !== "block") return;
  assert.equal(block.location.scope?.id, 12);
  assert.equal(block.parameterLocations?.[0]?.scope?.id, 12);
  assert.equal(block.body[0]?.location.scope?.id, 12);
  assert.match(
    JSON.stringify(block.body[0]?.location),
    /"scope":\{"kind":"introduced","id":12\}/,
  );
});

Deno.test("identity macro runtime failures keep structured macro traces", async () => {
  const result = await execute(
    "%macro(#identity, { syntax -> $syntax }). %identity($missing) print.",
  );
  assert.notEqual(result.code, 0);
  assert.match(text(result.stderr), /Unbound name "missing"/);
  assert.match(text(result.stderr), /expanded identity at fixture\.toss:1:/);
  assert.match(text(result.stderr), /defined at fixture\.toss:1:/);
});
