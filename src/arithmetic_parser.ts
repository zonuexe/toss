import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import type { Token } from "./lexer.ts";

export type ArithmeticCursor = {
  readonly current: () => Token;
  readonly advance: () => Token;
};

const selectors = {
  "+": "add:",
  "-": "subtract:",
  "*": "multiplyBy:",
  "/": "divideBy:",
  "%": "remainder:",
} as const;

function operand(cursor: ArithmeticCursor): Expression {
  const token = cursor.current();
  switch (token.kind) {
    case "arithmeticOperator":
      if (token.operator !== "-") {
        throw new TossSyntaxError(
          token.location,
          "Expected an arithmetic operand.",
        );
      }
      cursor.advance();
      return {
        kind: "send",
        receiver: operand(cursor),
        name: "negated",
        arguments: [],
        location: token.location,
      };
    case "number":
      cursor.advance();
      return { kind: "number", value: token.value, location: token.location };
    case "fetch":
      cursor.advance();
      return { kind: "fetch", name: token.name, location: token.location };
    case "arithmeticOpen":
      cursor.advance();
      return parseArithmeticBody(cursor);
    case "openParen": {
      cursor.advance();
      const expression = binary(cursor, 0);
      if (cursor.current().kind !== "closeParen") {
        throw new TossSyntaxError(
          cursor.current().location,
          "Expected ')' in arithmetic expression.",
        );
      }
      cursor.advance();
      return expression;
    }
    case "string":
    case "symbol":
    case "unary":
    case "keyword":
    case "period":
    case "pipe":
    case "closeParen":
    case "arithmeticClose":
    case "openBrace":
    case "closeBrace":
    case "openBracket":
    case "closeBracket":
    case "arrow":
    case "comma":
    case "eof":
      throw new TossSyntaxError(
        token.location,
        "Expected an arithmetic operand.",
      );
    default: {
      const exhaustive: never = token;
      throw new TypeError(`Unexpected token: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function precedence(operator: string): number {
  return operator === "*" || operator === "/" || operator === "%" ? 2 : 1;
}

function binary(cursor: ArithmeticCursor, minimum: number): Expression {
  let left = operand(cursor);
  let token = cursor.current();
  while (token.kind === "arithmeticOperator") {
    if (precedence(token.operator) < minimum) break;
    cursor.advance();
    const right = binary(cursor, precedence(token.operator) + 1);
    left = {
      kind: "send",
      receiver: left,
      name: selectors[token.operator],
      arguments: [right],
      location: token.location,
    };
    token = cursor.current();
  }
  return left;
}

export function parseArithmeticBody(cursor: ArithmeticCursor): Expression {
  const expression = binary(cursor, 0);
  if (cursor.current().kind !== "arithmeticClose") {
    throw new TossSyntaxError(
      cursor.current().location,
      "Expected ')' after arithmetic expression.",
    );
  }
  cursor.advance();
  return expression;
}
