import { type SourceLocation, TossSyntaxError } from "./diagnostic.ts";
import { comparisonOperatorAt } from "./comparison_operator.ts";
import { readJavaScriptMacro } from "./javascript_parser.ts";
import { type Token } from "./token.ts";
export type { Token } from "./token.ts";

export function lex(
  source: string,
  file: string,
): { readonly tokens: readonly Token[]; readonly end: Token } {
  let offset = 0;
  let line = 1;
  let column = 1;
  const tokens: Token[] = [];
  let arithmeticDepth = 0;
  const arithmeticMacros: number[] = [];
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

  function readNumber(start: SourceLocation): Token {
    let text = "";
    if (current() === "-") text += advance();
    while (/[0-9]/.test(current())) text += advance();
    if (current() === "." && /[0-9]/.test(source[offset + 1] ?? "")) {
      text += advance();
      while (/[0-9]/.test(current())) text += advance();
    }
    if (/[A-Za-z0-9_]/.test(current())) {
      throw new TossSyntaxError(start, "Invalid numeric literal.");
    }
    const value = Number(text);
    if (!Number.isFinite(value)) {
      throw new TossSyntaxError(start, "Number literal must be finite.");
    }
    return { kind: "number", value, location: start };
  }

  while (offset < source.length) {
    const start = location();
    const character = current();
    const comparisonOperator = arithmeticDepth > 0
      ? comparisonOperatorAt(source, offset)
      : undefined;
    if (/[ \t\r\n]/.test(character)) {
      advance();
    } else if (source.startsWith("//", offset)) {
      while (offset < source.length && !/[\r\n]/.test(current())) advance();
    } else if (character === "'") {
      tokens.push({ kind: "string", value: readString(), location: start });
    } else if (character === "$" && source[offset + 1] === "(") {
      advance();
      advance();
      arithmeticDepth++;
      arithmeticMacros.push(arithmeticDepth);
      tokens.push({ kind: "arithmeticOpen", location: start });
    } else if (character === "%" && source.startsWith("%import(", offset)) {
      for (let index = 0; index < 8; index++) advance();
      tokens.push({ kind: "importOpen", location: start });
    } else if (character === "%" && source.startsWith("%export(", offset)) {
      for (let index = 0; index < 8; index++) advance();
      tokens.push({ kind: "exportOpen", location: start });
    } else if (character === "%" && source.startsWith("%extend(", offset)) {
      for (let index = 0; index < 8; index++) advance();
      tokens.push({ kind: "extendOpen", location: start });
    } else if (character === "%" && source.startsWith("%super(", offset)) {
      for (let index = 0; index < 7; index++) advance();
      tokens.push({ kind: "superOpen", location: start });
    } else if (character === "%" && source.startsWith("%js(", offset)) {
      const macro = readJavaScriptMacro(source, offset, (position) => {
        let macroLine = line;
        let macroColumn = column;
        for (let index = offset; index < position;) {
          const point = source.codePointAt(index);
          const part = point === undefined ? "" : String.fromCodePoint(point);
          if (part === "\n") {
            macroLine++;
            macroColumn = 1;
          } else if (part !== "\r") macroColumn++;
          index += part.length;
        }
        return { file, line: macroLine, column: macroColumn };
      });
      while (offset < macro.end) advance();
      tokens.push({
        kind: "javascript",
        prefix: macro.prefix,
        source: macro.source,
        location: start,
      });
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
    } else if (source.startsWith("->", offset)) {
      advance();
      advance();
      tokens.push({ kind: "arrow", location: start });
    } else if (comparisonOperator !== undefined) {
      for (let index = 0; index < comparisonOperator.length; index++) advance();
      tokens.push({
        kind: "arithmeticOperator",
        operator: comparisonOperator,
        location: start,
      });
    } else if (arithmeticDepth > 0 && "+-*/%".includes(character)) {
      advance();
      const operator = character === "+"
        ? "+"
        : character === "-"
        ? "-"
        : character === "*"
        ? "*"
        : character === "/"
        ? "/"
        : "%";
      tokens.push({
        kind: "arithmeticOperator",
        operator,
        location: start,
      });
    } else if (arithmeticDepth > 0 && character === "(") {
      advance();
      arithmeticDepth++;
      tokens.push({ kind: "openParen", location: start });
    } else if (arithmeticDepth > 0 && character === ")") {
      advance();
      arithmeticDepth--;
      const macroClose = arithmeticMacros.at(-1) === arithmeticDepth + 1;
      if (macroClose) arithmeticMacros.pop();
      tokens.push({
        kind: macroClose ? "arithmeticClose" : "closeParen",
        location: start,
      });
    } else if (
      /[0-9]/.test(character) ||
      (arithmeticDepth === 0 && character === "-" &&
        /[0-9]/.test(source[offset + 1] ?? ""))
    ) {
      tokens.push(readNumber(start));
    } else if ("{}[]()".includes(character)) {
      advance();
      tokens.push({
        kind: character === "{"
          ? "openBrace"
          : character === "}"
          ? "closeBrace"
          : character === "["
          ? "openBracket"
          : character === "]"
          ? "closeBracket"
          : character === "("
          ? "openParen"
          : "closeParen",
        location: start,
      });
    } else if (source.startsWith("|>", offset)) {
      advance();
      advance();
      tokens.push({ kind: "pipe", location: start });
    } else if (",.:".includes(character)) {
      advance();
      tokens.push({
        kind: character === ","
          ? "comma"
          : character === ":"
          ? "colon"
          : "period",
        location: start,
      });
    } else {
      throw new TossSyntaxError(
        start,
        `Unexpected character ${JSON.stringify(character)}.`,
      );
    }
  }
  return { tokens, end: { kind: "eof", location: location() } };
}
