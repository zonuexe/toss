import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import type { Token } from "./token.ts";

type ImportParserCursor = {
  readonly current: () => Token;
  readonly advance: () => Token;
};

type ExportParserCursor = ImportParserCursor & {
  readonly pipeline: () => Expression;
};

export function parseImport(
  cursor: ImportParserCursor,
  location: Token["location"],
): Expression {
  const path = cursor.current();
  if (path.kind !== "string") {
    throw new TossSyntaxError(
      path.location,
      "%import requires one string literal path.",
    );
  }
  cursor.advance();
  if (cursor.current().kind !== "closeParen") {
    throw new TossSyntaxError(
      cursor.current().location,
      "%import accepts exactly one path.",
    );
  }
  cursor.advance();
  return { kind: "import", path: path.value, location };
}

export function parseExport(
  cursor: ExportParserCursor,
  location: Token["location"],
): Expression {
  if (cursor.current().kind === "closeParen") {
    throw new TossSyntaxError(
      cursor.current().location,
      "%export requires one expression.",
    );
  }
  const value = cursor.pipeline();
  if (cursor.current().kind !== "closeParen") {
    throw new TossSyntaxError(
      cursor.current().location,
      "%export accepts exactly one expression.",
    );
  }
  cursor.advance();
  return { kind: "export", value, location };
}
