import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { evaluateMacroExpression } from "./macro_evaluate.ts";
import type { MacroContext } from "./macro_value.ts";
import { isMacroSyntax } from "./macro_syntax.ts";
import { parseTokens } from "./parser.ts";
import {
  type SyntaxGroup,
  syntaxGroup,
  type SyntaxNode,
  type SyntaxOrigin,
  syntaxToken,
} from "./syntax.ts";
import { tokensFromSyntax } from "./syntax_tokens.ts";
import type { Token } from "./token.ts";

export function evaluateMacroQuotation(
  expression: Extract<Expression, { readonly kind: "quotation" }>,
  context: MacroContext,
): SyntaxGroup {
  const settings = context.quotation;
  if (settings === undefined) {
    throw new TossSyntaxError(
      expression.location,
      "Quotation evaluation requires quotation settings.",
    );
  }
  if (expression.mode === "literal") {
    return templateGroup(expression.syntax, settings, context, 1);
  }
  return quasiGroup(expression.syntax, 1, 1, settings, context);
}

export function parseMacroQuoteHole(group: SyntaxGroup): Expression {
  const children = childrenOf(group);
  const converted = tokensFromSyntax(syntaxGroup(
    "",
    children,
    group.origin,
  ));
  const location = group.origin.location;
  const tokens: Token[] = [
    ...converted.tokens,
    { kind: "period", location },
  ];
  const expressions = parseTokens(tokens, converted.end, location.file);
  if (expressions.length !== 1) {
    throw new TossSyntaxError(
      location,
      "Expected exactly one quote-hole expression.",
    );
  }
  const expression = expressions[0];
  if (expression === undefined) {
    throw new TossSyntaxError(location, "Expected one quote-hole expression.");
  }
  return expression;
}

function templateGroup(
  group: SyntaxGroup,
  settings: NonNullable<MacroContext["quotation"]>,
  context: MacroContext,
  depth: number,
): SyntaxGroup {
  context.state.consumeSyntaxNode(group.origin.location, depth);
  return syntaxGroup(
    group.delimiter,
    childrenOf(group).map((node) =>
      templateNode(node, settings, context, depth + 1)
    ),
    templateOrigin(group.origin, settings),
    group.prefix,
  );
}

function templateNode(
  node: SyntaxNode,
  settings: NonNullable<MacroContext["quotation"]>,
  context: MacroContext,
  depth: number,
): SyntaxNode {
  context.state.consumeSyntaxNode(node.origin.location, depth);
  if (node.kind === "group") {
    return templateGroup(node, settings, context, depth);
  }
  return syntaxToken(
    node.spelling,
    templateOrigin(node.origin, settings),
    node.flavor,
    node.rawJavaScript === undefined ? undefined : {
      prefix: node.rawJavaScript.prefix.map((part) =>
        templateNode(part, settings, context, depth + 1)
      ),
      source: node.rawJavaScript.source,
    },
    node.macroAdjacent,
  );
}

function quasiGroup(
  group: SyntaxGroup,
  quoteDepth: number,
  syntaxDepth: number,
  settings: NonNullable<MacroContext["quotation"]>,
  context: MacroContext,
): SyntaxGroup {
  context.state.consumeSyntaxNode(group.origin.location, syntaxDepth);
  const input = childrenOf(group);
  const output: SyntaxNode[] = [];
  for (let index = 0; index < input.length; index++) {
    const node = input[index];
    if (node === undefined) continue;
    const following = input[index + 1];
    if (
      node.kind === "token" && following?.kind === "group" &&
      (node.flavor === "unquote" || node.flavor === "splice")
    ) {
      if (quoteDepth === 1) {
        const location = node.origin.location;
        const holeContext = { ...context, location };
        const expression = (settings.parseHole ?? parseMacroQuoteHole)(
          following,
        );
        const value = evaluateMacroExpression(expression, holeContext);
        if (node.flavor === "unquote") {
          if (!isMacroSyntax(value)) {
            throw new TossSyntaxError(
              location,
              "Quote unquote requires a SyntaxNode.",
            );
          }
          output.push(value);
        } else {
          if (!Array.isArray(value) || !value.every(isMacroSyntax)) {
            throw new TossSyntaxError(
              location,
              "Quote splice requires an Array of SyntaxNodes.",
            );
          }
          output.push(...value);
        }
      } else {
        output.push(templateNode(node, settings, context, syntaxDepth + 1));
        output.push(quasiGroup(
          following,
          quoteDepth - 1,
          syntaxDepth + 1,
          settings,
          context,
        ));
      }
      index++;
      continue;
    }
    if (
      node.kind === "token" && node.flavor === "quasiquote" &&
      following?.kind === "group"
    ) {
      output.push(templateNode(node, settings, context, syntaxDepth + 1));
      output.push(quasiGroup(
        following,
        quoteDepth + 1,
        syntaxDepth + 1,
        settings,
        context,
      ));
      index++;
      continue;
    }
    output.push(
      quasiNode(node, quoteDepth, syntaxDepth + 1, settings, context),
    );
  }
  return syntaxGroup(
    group.delimiter,
    output,
    templateOrigin(group.origin, settings),
    group.prefix,
  );
}

function quasiNode(
  node: SyntaxNode,
  quoteDepth: number,
  syntaxDepth: number,
  settings: NonNullable<MacroContext["quotation"]>,
  context: MacroContext,
): SyntaxNode {
  context.state.consumeSyntaxNode(node.origin.location, syntaxDepth);
  if (node.kind === "group") {
    return quasiGroup(node, quoteDepth, syntaxDepth, settings, context);
  }
  return syntaxToken(
    node.spelling,
    templateOrigin(node.origin, settings),
    node.flavor,
    node.rawJavaScript === undefined ? undefined : {
      prefix: quasiChildren(
        node.rawJavaScript.prefix,
        quoteDepth,
        syntaxDepth,
        settings,
        context,
      ),
      source: node.rawJavaScript.source,
    },
    node.macroAdjacent,
  );
}

function quasiChildren(
  nodes: readonly SyntaxNode[],
  quoteDepth: number,
  syntaxDepth: number,
  settings: NonNullable<MacroContext["quotation"]>,
  context: MacroContext,
): readonly SyntaxNode[] {
  const synthetic = syntaxGroup(
    "",
    nodes,
    nodes[0]?.origin ?? {
      location: context.location,
      scope: settings.introducedScope,
      trace: settings.trace,
    },
  );
  return childrenOf(quasiGroup(
    synthetic,
    quoteDepth,
    syntaxDepth + 1,
    settings,
    context,
  ));
}

function childrenOf(group: SyntaxGroup): readonly SyntaxNode[] {
  return [...group.children];
}

function templateOrigin(
  origin: SyntaxOrigin,
  settings: NonNullable<MacroContext["quotation"]>,
): SyntaxOrigin {
  return {
    location: origin.location,
    scope: settings.introducedScope,
    trace: [...origin.trace, ...settings.trace],
  };
}
