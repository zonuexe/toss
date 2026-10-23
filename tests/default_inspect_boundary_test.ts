import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { evaluateMacroExpressions } from "../src/macro_evaluate.ts";
import { parse } from "../src/parser.ts";

Deno.test("default inspection keeps async evaluation unavailable to macro expanders", () => {
  const source =
    "%macro(#probe, { syntax -> %async({}). %quote(1) }). %probe().";

  assert.throws(
    () => compile(source, "async-inspect-boundary.toss"),
    TossSyntaxError,
  );
});

Deno.test("default Block inspection includes callable prelude slots in macro evaluation", () => {
  const source = "($Symbol at: 'generateUnique') inspect.";

  const result = evaluateMacroExpressions(parse(source, "native-inspect.toss"));

  assert.equal(result, "<block>");
});
