import { parse as parseAcorn } from "acorn";
import type { Expression } from "./ast.ts";
import { type SourceLocation, TossSyntaxError } from "./diagnostic.ts";
import { shiftExpressionLocations } from "./expression_locations.ts";
import type { Token } from "./token.ts";
import { readJavaScriptMacro } from "./javascript_parser.ts";

type BindingText = {
  readonly name: string;
  readonly source: string;
  readonly offset: number;
};

export function parseJavaScriptBindings(
  token: Extract<Token, { readonly kind: "javascript" }>,
  file: string,
  parseToss: (text: string) => readonly Expression[],
): Expression {
  const bindings = token.prefix.length === 0
    ? []
    : splitBindings(token.prefix, token.location);
  const names = new Set<string>();
  const parsed = bindings.map((binding) => {
    validateName(binding.name, token.location);
    if (names.has(binding.name)) {
      throw new TossSyntaxError(
        token.location,
        `Duplicate %js binding ${JSON.stringify(binding.name)}.`,
      );
    }
    names.add(binding.name);
    const start = position(
      token.location,
      token.prefix,
      binding.offset,
      file,
    );
    let values: readonly Expression[];
    try {
      values = parseToss(`${binding.source}\n.`);
    } catch (error) {
      if (!(error instanceof TossSyntaxError)) throw error;
      throw new TossSyntaxError(
        rebaseLocation(start, error.location),
        error.reason,
      );
    }
    if (values.length !== 1) {
      throw new TossSyntaxError(
        token.location,
        "Expected one Toss binding expression.",
      );
    }
    const value = values[0];
    if (value === undefined) {
      throw new TossSyntaxError(
        token.location,
        "Expected a Toss binding expression.",
      );
    }
    return {
      name: binding.name,
      value: shiftExpressionLocations(
        value,
        start,
      ),
    };
  });
  return {
    kind: "javascript",
    bindings: parsed,
    source: token.source,
    location: token.location,
  };
}

function rebaseLocation(
  start: SourceLocation,
  location: SourceLocation,
): SourceLocation {
  return {
    ...start,
    line: start.line + location.line - 1,
    column: location.line === 1
      ? start.column + location.column - 1
      : location.column,
  };
}

function splitBindings(
  source: string,
  location: SourceLocation,
): readonly BindingText[] {
  const segments = splitTopLevel(source, ",");
  if (segments.some((segment) => segment.text.trim().length === 0)) {
    throw new TossSyntaxError(
      location,
      "%js bindings cannot be empty or end with a comma.",
    );
  }
  return segments.map((segment) => {
    const equals = splitTopLevel(segment.text, "=");
    const name = equals[0]?.text.trim() ?? "";
    if (equals.length < 2 || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      throw new TossSyntaxError(
        location,
        "Each %js binding must be 'name = TossExpression'.",
      );
    }
    const rhs = segment.text.slice(segment.text.indexOf("=") + 1).trim();
    if (rhs.length === 0) {
      throw new TossSyntaxError(
        location,
        "%js binding requires a Toss expression.",
      );
    }
    return {
      name,
      source: rhs,
      offset: segment.offset + segment.text.indexOf(rhs),
    };
  });
}

function splitTopLevel(
  source: string,
  delimiter: string,
): readonly { readonly text: string; readonly offset: number }[] {
  const parts: { text: string; offset: number }[] = [];
  let depth = 0;
  let quote = false;
  let escaped = false;
  let lineComment = false;
  let start = 0;
  for (let offset = 0; offset < source.length; offset++) {
    const character = source[offset] ?? "";
    if (lineComment) {
      if (character === "\n" || character === "\r") lineComment = false;
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "'") quote = false;
    } else if (source.startsWith("//", offset)) {
      lineComment = true;
      offset++;
    } else if (source.startsWith("%js(", offset)) {
      const nested = readJavaScriptMacro(source, offset, () => ({
        file: "<binding>",
        line: 1,
        column: 1,
      }));
      offset = nested.end - 1;
    } else if (character === "'") quote = true;
    else if ("([{(".includes(character)) depth++;
    else if (")]})".includes(character)) depth--;
    else if (depth === 0 && character === delimiter) {
      parts.push({ text: source.slice(start, offset), offset: start });
      start = offset + 1;
    }
  }
  parts.push({ text: source.slice(start), offset: start });
  return parts;
}

function validateName(name: string, location: SourceLocation): void {
  try {
    parseAcorn(`"use strict"; (function(${name}) {})`, {
      ecmaVersion: "latest",
    });
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new TossSyntaxError(
      location,
      `Invalid strict JavaScript binding name ${JSON.stringify(name)}.`,
    );
  }
}

function position(
  base: SourceLocation,
  prefix: string,
  offset: number,
  file: string,
): SourceLocation {
  let line = base.line;
  let column = base.column + 4;
  for (const character of prefix.slice(0, offset)) {
    if (character === "\n") {
      line++;
      column = 1;
    } else if (character !== "\r") column++;
  }
  return { file, line, column };
}
