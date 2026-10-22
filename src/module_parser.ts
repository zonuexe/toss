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

export function parseJavaScriptImport(
  cursor: ImportParserCursor,
  location: Token["location"],
): Expression {
  const token = cursor.current();
  if (token.kind !== "string" || token.value.length === 0) {
    throw new TossSyntaxError(
      token.location,
      "%jsImport requires one nonempty string literal specifier.",
    );
  }
  cursor.advance();
  if (cursor.current().kind !== "closeParen") {
    throw new TossSyntaxError(
      cursor.current().location,
      "%jsImport accepts exactly one specifier.",
    );
  }
  cursor.advance();
  const specifier = token.value;
  if (
    /^[./\\]/.test(specifier) || /^[A-Za-z]:/.test(specifier) ||
    specifier.includes("\\") || [...specifier].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x20 || code === 0x7f;
    })
  ) {
    throw new TossSyntaxError(
      token.location,
      `Invalid JavaScript module specifier ${JSON.stringify(specifier)}.`,
    );
  }
  return { kind: "javascriptImport", specifier, location };
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
