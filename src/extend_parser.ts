import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import type { Token } from "./lexer.ts";

export type ExtendParserCursor = {
  readonly current: () => Token;
  readonly advance: () => Token;
  readonly pipeline: () => Expression;
};

export function parseExtend(
  cursor: ExtendParserCursor,
  input: Expression,
  location: Token["location"],
): Expression {
  const entries: {
    readonly key: string;
    readonly value: Expression;
    readonly location: Token["location"];
  }[] = [];
  while (cursor.current().kind !== "closeParen") {
    const label = cursor.current();
    if (label.kind !== "keyword") {
      throw new TossSyntaxError(
        label.location,
        "Expected an extension entry label.",
      );
    }
    cursor.advance();
    const next = cursor.current();
    if (
      next.kind === "closeParen" || next.kind === "comma" ||
      next.kind === "period" || next.kind === "eof"
    ) {
      throw new TossSyntaxError(
        next.location,
        "Expected an extension entry value.",
      );
    }
    entries.push({
      key: label.name.slice(0, -1),
      value: cursor.pipeline(),
      location: label.location,
    });
    if (cursor.current().kind !== "comma") break;
    cursor.advance();
    if (cursor.current().kind === "closeParen") {
      throw new TossSyntaxError(
        cursor.current().location,
        "Expected an extension entry after ','.",
      );
    }
  }
  if (cursor.current().kind !== "closeParen") {
    throw new TossSyntaxError(
      cursor.current().location,
      "Expected ')' after extension entries.",
    );
  }
  cursor.advance();
  return { kind: "extend", input, entries, location };
}
