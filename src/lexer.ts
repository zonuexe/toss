import { type SourceLocation, TossSyntaxError } from "./diagnostic.ts";

export type Token =
  | {
    readonly kind: "string";
    readonly value: string;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "symbol";
    readonly name: string;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "fetch";
    readonly name: string;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "unary";
    readonly name: string;
    readonly location: SourceLocation;
  }
  | {
    readonly kind: "keyword";
    readonly name: string;
    readonly location: SourceLocation;
  }
  | { readonly kind: "period"; readonly location: SourceLocation }
  | { readonly kind: "pipe"; readonly location: SourceLocation }
  | { readonly kind: "openParen"; readonly location: SourceLocation }
  | { readonly kind: "closeParen"; readonly location: SourceLocation }
  | { readonly kind: "eof"; readonly location: SourceLocation };

export function lex(
  source: string,
  file: string,
): { readonly tokens: readonly Token[]; readonly end: Token } {
  let offset = 0;
  let line = 1;
  let column = 1;
  const tokens: Token[] = [];
  const location = (): SourceLocation => ({ file, line, column });
  const current = (): string => {
    const point = source.codePointAt(offset);
    return point === undefined ? "" : String.fromCodePoint(point);
  };

  function advance(): string {
    const character = current();
    if (character === "\r") {
      line++;
      column = 1;
    } else if (character === "\n") {
      if (source[offset - 1] !== "\r") line++;
      column = 1;
    } else {
      column++;
    }
    offset += character.length;
    return character;
  }

  function readName(): string {
    if (!/[A-Za-z_]/.test(current())) {
      throw new TossSyntaxError(location(), "Expected a name.");
    }
    let name = advance();
    while (/[A-Za-z0-9_]/.test(current())) name += advance();
    return name;
  }

  function readString(): string {
    const start = location();
    advance();
    let value = "";
    while (offset < source.length) {
      const character = advance();
      if (character === "'") return value;
      if (character === "\\" && (current() === "\\" || current() === "'")) {
        value += advance();
      } else {
        value += character;
      }
    }
    throw new TossSyntaxError(start, "Unterminated string.");
  }

  while (offset < source.length) {
    const start = location();
    const character = current();
    if (/[ \t\r\n]/.test(character)) {
      advance();
    } else if (source.startsWith("//", offset)) {
      while (offset < source.length && !/[\r\n]/.test(current())) advance();
    } else if (character === "'") {
      tokens.push({ kind: "string", value: readString(), location: start });
    } else if (character === "#" || character === "$") {
      advance();
      tokens.push({
        kind: character === "#" ? "symbol" : "fetch",
        name: readName(),
        location: start,
      });
    } else if (/[A-Za-z_]/.test(character)) {
      const name = readName();
      if (current() === ":") {
        advance();
        tokens.push({ kind: "keyword", name: name + ":", location: start });
      } else {
        tokens.push({ kind: "unary", name, location: start });
      }
    } else if (source.startsWith("|>", offset)) {
      advance();
      advance();
      tokens.push({ kind: "pipe", location: start });
    } else if (character === "(" || character === ")") {
      advance();
      tokens.push({
        kind: character === "(" ? "openParen" : "closeParen",
        location: start,
      });
    } else if (character === ".") {
      advance();
      tokens.push({ kind: "period", location: start });
    } else {
      throw new TossSyntaxError(
        start,
        `Unexpected character ${JSON.stringify(character)}.`,
      );
    }
  }
  return { tokens, end: { kind: "eof", location: location() } };
}
