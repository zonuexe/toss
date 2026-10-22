import type { Expression } from "./ast.ts";
import type { ArithmeticOperator } from "./comparison_operator.ts";
import { type SourceLocation, TossSyntaxError } from "./diagnostic.ts";
import { lex } from "./lexer.ts";
import { parseTokens } from "./parser.ts";
import { flattenSyntax } from "./syntax_flatten.ts";
import { readSyntax, type SyntaxReadOptions } from "./syntax_reader.ts";
import type { SyntaxGroup, SyntaxNode, SyntaxToken } from "./syntax.ts";
import type { Token } from "./token.ts";
import { specialMacro } from "./syntax_special_macro.ts";

export type ParseSyntaxOptions = Omit<SyntaxReadOptions, "file"> & {
  readonly file?: string;
};

export function parseSyntax(
  fragment: string,
  options: ParseSyntaxOptions = {},
): readonly Expression[] {
  const file = options.file ?? "<syntax>";
  const syntax = readSyntax(fragment, { ...options, file });
  const converted = tokensFromSyntax(syntax);
  return parseTokens(converted.tokens, converted.end, file);
}

export function tokensFromSyntax(
  syntax: SyntaxGroup,
): { readonly tokens: readonly Token[]; readonly end: Token } {
  const tokens: Token[] = [];
  const sourceLocation = (node: SyntaxNode): SourceLocation => {
    const { scope, trace } = node.origin;
    return {
      ...node.origin.location,
      ...(scope.id === 0 ? {} : { scope }),
      ...(trace.length === 0 ? {} : { trace }),
    };
  };
  const appendNode = (node: SyntaxNode, inArithmetic: boolean): void => {
    if (node.kind === "group") {
      const arithmetic = node.prefix === "$";
      const open = node.delimiter === "()"
        ? arithmetic ? "arithmeticOpen" : "openParen"
        : node.delimiter === "[]"
        ? "openBracket"
        : node.delimiter === "{}"
        ? "openBrace"
        : undefined;
      const close = node.delimiter === "()"
        ? arithmetic ? "arithmeticClose" : "closeParen"
        : node.delimiter === "[]"
        ? "closeBracket"
        : node.delimiter === "{}"
        ? "closeBrace"
        : undefined;
      if (open !== undefined) {
        tokens.push({ kind: open, location: sourceLocation(node) });
      }
      appendChildren(node.children, inArithmetic || arithmetic);
      if (close !== undefined) {
        if (node.closed !== false) {
          tokens.push({
            kind: close,
            location: sourceLocation({
              ...node,
              origin: {
                ...node.origin,
                location: node.endLocation ?? node.origin.location,
              },
            }),
          });
        }
      }
      return;
    }
    const token = node;
    appendSyntaxToken(token, inArithmetic);
  };

  const appendChildren = (
    nodes: readonly SyntaxNode[],
    inArithmetic: boolean,
  ): void => {
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      if (node === undefined) continue;
      const following = nodes[index + 1];
      const quotationMarker = node.kind === "token" &&
        (node.flavor === "quasiquote" ||
          node.flavor === "macro" && node.spelling === "%quote" &&
            node.macroAdjacent);
      if (quotationMarker && following?.kind === "group") {
        if (following.delimiter !== "()") {
          throw new TossSyntaxError(
            sourceLocation(node),
            "Quotation requires a parenthesized form.",
          );
        }
        tokens.push({
          kind: "quotation",
          syntax: syntaxFragment(following),
          mode: node.flavor === "quasiquote" ? "quasi" : "literal",
          location: sourceLocation(node),
        });
        index++;
        continue;
      }
      if (
        node.kind === "token" && following?.kind === "group" &&
        node.flavor === "macro" && node.macroAdjacent &&
        specialMacro(node.spelling) !== undefined
      ) {
        const kind = specialMacro(node.spelling);
        if (kind !== undefined) {
          tokens.push({ kind, location: sourceLocation(node) });
          if (kind === "asyncOpen") {
            following.children.forEach((child) =>
              appendNode(child, inArithmetic)
            );
          } else {
            appendChildren(following.children, inArithmetic);
          }
          tokens.push({
            kind: "closeParen",
            location: sourceLocation(following),
          });
          index++;
          continue;
        }
      }
      if (
        node.kind === "token" &&
        (node.flavor === "unquote" || node.flavor === "splice")
      ) {
        throw new TossSyntaxError(
          sourceLocation(node),
          "Unquote requires a surrounding quasiquotation.",
        );
      }
      appendNode(node, inArithmetic);
    }
  };

  const appendSyntaxToken = (
    node: SyntaxToken,
    inArithmetic: boolean,
  ): void => {
    const closing = node.spelling === ")"
      ? "closeParen"
      : node.spelling === "]"
      ? "closeBracket"
      : node.spelling === "}"
      ? "closeBrace"
      : undefined;
    if (closing !== undefined) {
      tokens.push({ kind: closing, location: sourceLocation(node) });
      return;
    }
    if (node.flavor === "rawJavaScript" && node.rawJavaScript !== undefined) {
      tokens.push({
        kind: "javascript",
        prefix: flattenSyntax({
          kind: "group",
          delimiter: "",
          prefix: "",
          children: node.rawJavaScript.prefix,
          origin: node.origin,
        }).source,
        syntaxPrefix: node.rawJavaScript.prefix,
        source: node.rawJavaScript.source,
        location: sourceLocation(node),
      });
      return;
    }
    if (
      node.flavor === "arithmetic" ||
      inArithmetic && isArithmetic(node.spelling)
    ) {
      const operator = node.spelling;
      if (operator === "(" || operator === ")") return;
      tokens.push({
        kind: "arithmeticOperator",
        operator: arithmeticOperator(operator, sourceLocation(node)),
        location: sourceLocation(node),
      });
      return;
    }
    const parsed = lex(node.spelling, node.origin.location.file);
    const first = parsed.tokens[0];
    if (
      first === undefined || parsed.tokens.length !== 1 ||
      parsed.end.kind !== "eof"
    ) {
      throw new TossSyntaxError(sourceLocation(node), "Invalid syntax token.");
    }
    tokens.push({ ...first, location: sourceLocation(node) });
  };

  appendChildren(syntax.children, false);
  const last = syntax.endLocation ??
    syntax.children.at(-1)?.origin.location ?? syntax.origin.location;
  const end = { kind: "eof" as const, location: last };
  return { tokens, end };
}

function syntaxFragment(group: SyntaxGroup): SyntaxGroup {
  return Object.freeze({
    kind: "group",
    delimiter: "",
    prefix: "",
    children: Object.freeze([...group.children]),
    origin: group.origin,
  });
}

function isArithmetic(spelling: string): boolean {
  return ["+", "-", "*", "/", "%", "<", "<=", ">", ">=", "==", "!="].includes(
    spelling,
  );
}

function arithmeticOperator(
  spelling: string,
  location: SourceLocation,
): ArithmeticOperator {
  switch (spelling) {
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "==":
    case "!=":
      return spelling;
    default:
      throw new TossSyntaxError(location, "Invalid arithmetic operator.");
  }
}
