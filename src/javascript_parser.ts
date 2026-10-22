import { parse, parseExpressionAt } from "acorn";
import { type SourceLocation, TossSyntaxError } from "./diagnostic.ts";

export type JavaScriptMacroSource = {
  readonly prefix: string;
  readonly source: string;
  readonly end: number;
};

export function readJavaScriptMacro(
  input: string,
  start: number,
  location: (offset: number) => SourceLocation,
): JavaScriptMacroSource {
  try {
    const expression = parseExpressionAt(input, start + 4, {
      ecmaVersion: "latest",
      sourceType: "script",
      preserveParens: true,
    });
    const close = skipTrivia(input, expression.end);
    if (input[close] === ")") {
      const source = input.slice(start + 4, expression.end);
      validateExpression(source, location(start + 4));
      return { prefix: "", source, end: close + 1 };
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  const bodyStart = start + 4;
  let separator = -1;
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  for (let offset = bodyStart; offset < input.length; offset++) {
    const character = input[offset] ?? "";
    const following = input[offset + 1] ?? "";
    if (lineComment) {
      if (character === "\n" || character === "\r") lineComment = false;
      continue;
    }
    if (quote !== "") {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (input.startsWith("%js(", offset)) {
      const nested = readJavaScriptMacro(input, offset, location);
      offset = nested.end - 1;
      continue;
    }
    if (character === "/" && following === "/") {
      lineComment = true;
      offset++;
    } else if (character === "'" || character === '"' || character === "`") {
      quote = character;
    } else if (character === "(" || character === "[" || character === "{") {
      depth++;
    } else if (character === ")" && separator < 0) {
      if (depth === 0) {
        return parseJavaScriptTail(input, bodyStart, start, location);
      }
      depth--;
    } else if (character === "]" || character === "}") {
      depth--;
      if (depth < 0) {
        throw new TossSyntaxError(
          location(offset),
          "Unexpected JavaScript delimiter.",
        );
      }
    } else if (character === ";" && depth === 0 && separator < 0) {
      separator = offset;
      break;
    }
  }
  if (separator < 0) {
    return parseJavaScriptTail(input, bodyStart, start, location);
  }
  const prefix = input.slice(bodyStart, separator);
  if (prefix.trim().length === 0) {
    throw new TossSyntaxError(
      location(separator),
      "%js bindings cannot be empty.",
    );
  }
  return parseJavaScriptTail(input, separator + 1, start, location, prefix);
}

function parseJavaScriptTail(
  input: string,
  expressionStart: number,
  macroStart: number,
  location: (offset: number) => SourceLocation,
  prefix = "",
): JavaScriptMacroSource {
  const expressionOffset = skipTrivia(input, expressionStart);
  try {
    const expression = parseExpressionAt(input, expressionOffset, {
      ecmaVersion: "latest",
      sourceType: "script",
      preserveParens: true,
    });
    const close = skipTrivia(input, expression.end);
    if (input[close] !== ")") {
      throw new SyntaxError("Expected one JavaScript expression and ')' .");
    }
    const source = input.slice(expressionOffset, expression.end);
    validateExpression(source, location(expressionOffset));
    return { prefix, source, end: close + 1 };
  } catch (error) {
    if (error instanceof TossSyntaxError) throw error;
    if (!(error instanceof SyntaxError)) throw error;
    throw new TossSyntaxError(
      location(macroStart),
      `Invalid %js expression: ${error.message}`,
    );
  }
}

function skipTrivia(source: string, start: number): number {
  let offset = start;
  while (offset < source.length) {
    if (/\s/.test(source[offset] ?? "")) offset++;
    else if (source.startsWith("//", offset)) {
      while (offset < source.length && !/[\r\n]/.test(source[offset] ?? "")) {
        offset++;
      }
    } else if (source.startsWith("/*", offset)) {
      const close = source.indexOf("*/", offset + 2);
      if (close < 0) return offset;
      offset = close + 2;
    } else return offset;
  }
  return offset;
}

function validateExpression(source: string, location: SourceLocation): void {
  if (source.trim().length === 0) {
    throw new TossSyntaxError(
      location,
      "%js requires one JavaScript expression.",
    );
  }
  try {
    const expression = parseExpressionAt(source, firstNonSpace(source), {
      ecmaVersion: "latest",
      sourceType: "script",
      preserveParens: true,
    });
    if (source.slice(expression.end).trim().length !== 0) {
      throw new SyntaxError("Expected one JavaScript expression.");
    }
    parse(`"use strict"; (function(){ return (${source}); })`, {
      ecmaVersion: "latest",
      sourceType: "script",
    });
  } catch (error) {
    if (error instanceof TossSyntaxError) throw error;
    if (!(error instanceof SyntaxError)) throw error;
    throw new TossSyntaxError(
      location,
      `Invalid %js expression: ${error.message}`,
    );
  }
}

function firstNonSpace(source: string): number {
  let offset = 0;
  while (/\s/.test(source[offset] ?? "")) offset++;
  return offset;
}
