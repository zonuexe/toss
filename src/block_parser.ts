import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import type { Token } from "./lexer.ts";

export type BlockParserCursor = {
  readonly current: () => Token;
  readonly advance: () => Token;
  readonly pipeline: () => Expression;
};

export function parseBlock(
  cursor: BlockParserCursor,
  location: Token["location"],
): Expression {
  const parameters: string[] = [];
  const parameterLocations: Token["location"][] = [];
  const names = new Set<string>();
  let parameter = cursor.current();
  if (parameter.kind === "unary") {
    while (parameter.kind === "unary") {
      if (names.has(parameter.name)) {
        throw new TossSyntaxError(
          parameter.location,
          `Duplicate block parameter ${JSON.stringify(parameter.name)}.`,
        );
      }
      names.add(parameter.name);
      parameters.push(parameter.name);
      parameterLocations.push(parameter.location);
      cursor.advance();
      if (cursor.current().kind !== "comma") break;
      cursor.advance();
      parameter = cursor.current();
      if (parameter.kind !== "unary") {
        throw new TossSyntaxError(
          parameter.location,
          "Expected a block parameter after ','.",
        );
      }
    }
    if (cursor.current().kind !== "arrow") {
      throw new TossSyntaxError(
        cursor.current().location,
        "Expected '->' after block parameter.",
      );
    }
    cursor.advance();
  }
  const body: Expression[] = [];
  if (cursor.current().kind !== "closeBrace") {
    body.push(cursor.pipeline());
    while (cursor.current().kind === "period") {
      cursor.advance();
      if (cursor.current().kind === "closeBrace") break;
      body.push(cursor.pipeline());
    }
  }
  if (cursor.current().kind !== "closeBrace") {
    throw new TossSyntaxError(
      cursor.current().location,
      "Expected '}' after block body.",
    );
  }
  cursor.advance();
  return {
    kind: "block",
    parameters,
    ...(location.scope !== undefined || location.trace !== undefined ||
        parameterLocations.some((origin) =>
          origin.scope !== undefined || origin.trace !== undefined
        )
      ? { parameterLocations }
      : {}),
    body,
    location,
  };
}
