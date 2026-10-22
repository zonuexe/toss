import type { Expression } from "./ast.ts";
import { parseArithmeticBody } from "./arithmetic_parser.ts";
import { parseBlock } from "./block_parser.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { parseExport, parseImport } from "./module_parser.ts";
import type { Token } from "./token.ts";

export type PrimaryParseContext = {
  readonly current: () => Token;
  readonly advance: () => Token;
  readonly pipeline: () => Expression;
  readonly parseJavaScript: (
    token: Extract<Token, { readonly kind: "javascript" }>,
  ) => Expression;
};

export function parsePrimary(context: PrimaryParseContext): Expression {
  const token = context.advance();
  switch (token.kind) {
    case "importOpen":
      return parseImport(context, token.location);
    case "exportOpen":
      return parseExport(context, token.location);
    case "javascript":
      return context.parseJavaScript(token);
    case "quotation":
      return {
        kind: "quotation",
        syntax: token.syntax,
        mode: token.mode,
        location: token.location,
      };
    case "arithmeticOpen":
      return parseArithmeticBody(context);
    case "superOpen": {
      const args: Expression[] = [];
      if (context.current().kind !== "closeParen") {
        args.push(context.pipeline());
        while (context.current().kind === "comma") {
          context.advance();
          if (context.current().kind === "closeParen") {
            throw new TossSyntaxError(
              context.current().location,
              "Expected an expression after ','.",
            );
          }
          args.push(context.pipeline());
        }
      }
      if (context.current().kind !== "closeParen") {
        throw new TossSyntaxError(
          context.current().location,
          "Expected ')' after %super arguments.",
        );
      }
      context.advance();
      return { kind: "super", arguments: args, location: token.location };
    }
    case "number":
      return { kind: "number", value: token.value, location: token.location };
    case "string":
      return { kind: "string", value: token.value, location: token.location };
    case "symbol":
      return { kind: "symbol", name: token.name, location: token.location };
    case "fetch":
      return { kind: "fetch", name: token.name, location: token.location };
    case "openBracket": {
      const elements: Expression[] = [];
      if (context.current().kind !== "closeBracket") {
        elements.push(context.pipeline());
        while (context.current().kind === "comma") {
          context.advance();
          if (context.current().kind === "closeBracket") {
            throw new TossSyntaxError(
              context.current().location,
              "Expected an expression after ','.",
            );
          }
          elements.push(context.pipeline());
        }
      }
      if (context.current().kind !== "closeBracket") {
        throw new TossSyntaxError(
          context.current().location,
          "Expected ']' after array elements.",
        );
      }
      context.advance();
      return { kind: "array", elements, location: token.location };
    }
    case "openBrace":
      return parseBlock(context, token.location);
    case "openParen": {
      const expression = context.pipeline();
      if (context.current().kind !== "closeParen") {
        throw new TossSyntaxError(
          context.current().location,
          "Expected ')' after grouped expression.",
        );
      }
      context.advance();
      return expression;
    }
    case "arithmeticClose":
    case "arithmeticOperator":
    case "extendOpen":
    case "unary":
    case "keyword":
    case "period":
    case "pipe":
    case "closeParen":
    case "closeBrace":
    case "closeBracket":
    case "arrow":
    case "comma":
    case "colon":
    case "eof":
      throw new TossSyntaxError(token.location, "Expected an expression.");
    default: {
      const exhaustive: never = token;
      throw new TypeError(`Unexpected token: ${JSON.stringify(exhaustive)}`);
    }
  }
}
