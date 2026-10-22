import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { parseTokens } from "./parser.ts";
import { tokensFromSyntax } from "./syntax_tokens.ts";
import { type SyntaxGroup, syntaxGroup, type SyntaxNode } from "./syntax.ts";
import type { Token } from "./token.ts";

export function parseSyntaxExpression(
  nodes: readonly SyntaxNode[],
  location: SyntaxGroup["origin"]["location"],
  endLocation?: SyntaxGroup["origin"]["location"],
): Expression {
  const fragment = syntaxGroup(
    "",
    nodes,
    nodes[0]?.origin ?? {
      location,
      scope: { kind: "caller", id: 0 },
      trace: [],
    },
    "",
    endLocation,
  );
  const converted = tokensFromSyntax(fragment);
  const periodLocation = endLocation ?? fragment.endLocation ??
    nodes.at(-1)?.origin.location ?? location;
  const end = { kind: "period", location: periodLocation } satisfies Token;
  const expressions = parseTokens(
    [...converted.tokens, end],
    converted.end,
    location.file,
  );
  if (expressions.length !== 1) {
    throw new TossSyntaxError(
      location,
      "Expected exactly one Toss expression.",
    );
  }
  const expression = expressions[0];
  if (expression === undefined) {
    throw new TossSyntaxError(
      location,
      "Expected exactly one Toss expression.",
    );
  }
  return expression;
}
