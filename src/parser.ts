import { type SourceLocation, TossSyntaxError } from "./diagnostic.ts";

export type Message = {
  readonly name: string;
  readonly location: SourceLocation;
};

export type Statement = {
  readonly value: string;
  readonly messages: readonly Message[];
};

export function parse(source: string, file: string): readonly Statement[] {
  let offset = 0;
  let line = 1;
  let column = 1;
  const statements: Statement[] = [];

  function location(): SourceLocation {
    return { file, line, column };
  }

  function current(): string {
    const point = source.codePointAt(offset);
    return point === undefined ? "" : String.fromCodePoint(point);
  }

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

  function skipTrivia(): void {
    while (offset < source.length) {
      if (/[ \t\r\n]/.test(current())) {
        advance();
      } else if (source.startsWith("//", offset)) {
        while (offset < source.length && !/[\r\n]/.test(current())) advance();
      } else {
        break;
      }
    }
  }

  function readString(): string {
    const start = location();
    if (current() !== "'") {
      throw new TossSyntaxError(start, "Expected a single-quoted string.");
    }
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

  skipTrivia();
  while (offset < source.length) {
    const value = readString();
    const messages: Message[] = [];
    skipTrivia();
    while (/[A-Za-z_]/.test(current())) {
      const start = location();
      let name = advance();
      while (/[A-Za-z0-9_]/.test(current())) name += advance();
      messages.push({ name, location: start });
      skipTrivia();
    }
    if (current() !== ".") {
      throw new TossSyntaxError(location(), "Expected '.' after expression.");
    }
    advance();
    statements.push({ value, messages });
    skipTrivia();
  }
  return statements;
}
