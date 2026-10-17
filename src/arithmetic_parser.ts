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

const comparisons = {
  "<": "lessThan:",
  "<=": "lessThanOrEqual:",
  ">": "greaterThan:",
  ">=": "greaterThanOrEqual:",
  "==": "equals:",
  "!=": "equals:",
} as const;

type Comparison = keyof typeof comparisons;
type ArithmeticOperator = keyof typeof selectors;

function isArithmeticOperator(
  operator: string,
): operator is ArithmeticOperator {
  return Object.hasOwn(selectors, operator);
}

function isComparison(operator: string): operator is Comparison {
  return Object.hasOwn(comparisons, operator);
}

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
      const expression = comparison(cursor);
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
    case "extendOpen":
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
    case "colon":
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

function arithmeticPrecedence(operator: string): number {
  return operator === "*" || operator === "/" || operator === "%" ? 2 : 1;
}

function binary(cursor: ArithmeticCursor, minimum: number): Expression {
  let left = operand(cursor);
  let token = cursor.current();
  while (token.kind === "arithmeticOperator") {
    if (
      !isArithmeticOperator(token.operator) ||
      arithmeticPrecedence(token.operator) < minimum
    ) break;
    cursor.advance();
    const operator = token.operator;
    const right = binary(cursor, arithmeticPrecedence(operator) + 1);
    left = {
      kind: "send",
      receiver: left,
      name: selectors[operator],
      arguments: [right],
      location: token.location,
    };
    token = cursor.current();
  }
  return left;
}

function comparison(cursor: ArithmeticCursor): Expression {
  const left = binary(cursor, 0);
  const token = cursor.current();
  if (token.kind !== "arithmeticOperator" || !isComparison(token.operator)) {
    return left;
  }
  const operator = token.operator;
  cursor.advance();
  const right = binary(cursor, 0);
  const name = comparisons[operator];
  const result: Expression = {
    kind: "send",
    receiver: left,
    name,
    arguments: [right],
    location: token.location,
  };
  if (operator !== "!=") return result;
  return {
    kind: "send",
    receiver: result,
    name: "not",
    arguments: [],
    location: token.location,
  };
}

export function parseArithmeticBody(cursor: ArithmeticCursor): Expression {
  const expression = comparison(cursor);
  const extra = cursor.current();
  if (extra.kind === "arithmeticOperator" && isComparison(extra.operator)) {
    throw new TossSyntaxError(extra.location, "Comparisons cannot be chained.");
  }
  if (cursor.current().kind !== "arithmeticClose") {
    throw new TossSyntaxError(
      cursor.current().location,
      "Expected ')' after arithmetic expression.",
    );
  }
  cursor.advance();
  return expression;
}
