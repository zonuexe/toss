import assert from "node:assert/strict";
import { evaluateMacroExpression } from "../src/macro_evaluate.ts";
import { macroRootEnvironment, MacroState } from "../src/macro_value.ts";
import { flattenSyntax } from "../src/syntax_flatten.ts";
import { parseSyntax } from "../src/syntax_tokens.ts";

Deno.test("quasiquote leaves unquote spelling inside Toss JS-binding strings inert", () => {
  const expression = parseSyntax("%`(%js(x = '%,($missing)'; x)).")[0];
  assert.ok(expression);
  const value = evaluateMacroExpression(expression, {
    state: new MacroState(),
    environment: macroRootEnvironment(),
    location: expression.location,
    quotation: {
      introducedScope: { kind: "introduced", id: 1 },
      trace: [],
    },
  });
  assert.ok(value !== null && typeof value === "object" && "kind" in value);
  assert.equal(value.kind, "group");
  if (value.kind !== "group") return;
  const output = parseSyntax(`${flattenSyntax(value).source}.`)[0];
  assert.equal(output?.kind, "javascript");
  if (output?.kind !== "javascript") return;
  const binding = output.bindings[0]?.value;
  assert.equal(binding?.kind, "string");
  if (binding?.kind === "string") assert.equal(binding.value, "%,($missing)");
});
