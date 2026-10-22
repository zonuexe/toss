import { type SourceLocation, TossSyntaxError } from "./diagnostic.ts";
import { comparisonOperatorAt } from "./comparison_operator.ts";
import { readRawJavaScript } from "./syntax_reader_javascript.ts";
import { JavaScriptBindingPrefix } from "./syntax_reader_bindings.ts";
import { type SyntaxFrame, tossStringEnd } from "./syntax_reader_support.ts";
import {
  type SyntaxGroup,
  type SyntaxNode,
  syntaxToken,
  type SyntaxTokenFlavor,
} from "./syntax.ts";
import {
  closeSyntaxGroup,
  finishSyntaxGroups,
  openSyntaxGroup,
} from "./syntax_reader_groups.ts";
import type { SyntaxReadOptions } from "./syntax_reader.ts";

export function scanSyntax(
  source: string,
  options: SyntaxReadOptions,
): SyntaxGroup {
  let offset = 0;
  let line = options.startLocation?.line ?? 1;
  let column = options.startLocation?.column ?? 1;
  const scope = options.scope ?? Object.freeze({ kind: "caller", id: 0 });
  const bindingPrefix = new JavaScriptBindingPrefix(
    options.javascriptBindingPrefix === true,
  );
  const loc = (): SourceLocation => ({ file: options.file, line, column });
  const char = (): string => {
    const point = source.codePointAt(offset);
    return point === undefined ? "" : String.fromCodePoint(point);
  };
  const advance = (): string => {
    const value = char();
    offset += value.length;
    if (value === "\r") {
      line++;
      column = 1;
      if (source[offset] === "\n") offset++;
    } else if (value === "\n") {
      line++;
      column = 1;
    } else column++;
    return value;
  };
  const origin = (location: SourceLocation) => ({ location, scope, trace: [] });
  const stack: SyntaxFrame[] = [{
    open: "",
    close: "",
    start: loc(),
    children: [],
  }];
  const add = (
    spelling: string,
    flavor: SyntaxTokenFlavor,
    start: SourceLocation,
    rawJavaScript?: {
      readonly prefix: readonly SyntaxNode[];
      readonly source: string;
    },
    macroAdjacent?: boolean,
  ): void => {
    stack.at(-1)?.children.push(
      syntaxToken(
        spelling,
        origin(start),
        flavor,
        rawJavaScript,
        macroAdjacent,
      ),
    );
  };
  while (offset < source.length) {
    const start = loc();
    const value = char();
    const comparison = comparisonOperatorAt(source, offset);
    if (
      comparison !== undefined && stack.some((frame) => frame.open === "$(")
    ) {
      for (let index = 0; index < comparison.length; index++) advance();
      add(comparison, "arithmetic", start);
      continue;
    }
    if (/[ \t\r\n]/.test(value)) {
      advance();
      continue;
    }
    if (source.startsWith("//", offset)) {
      while (offset < source.length && !/[\r\n]/.test(char())) advance();
      continue;
    }
    if (bindingPrefix.readName(source, offset, start, advance, add)) continue;
    if (value === "'") {
      const end = tossStringEnd(source, offset);
      if (end === undefined) {
        throw new TossSyntaxError(start, "Unterminated string.");
      }
      const spelling = source.slice(offset, end);
      while (offset < end) advance();
      add(spelling, "string", start);
      continue;
    }
    if (source.startsWith("%js(", offset)) {
      const js = readRawJavaScript(
        source,
        offset,
        options.file,
        scope,
        scanSyntax,
        options.startLocation,
      );
      add(js.spelling, "rawJavaScript", start, {
        prefix: js.prefix,
        source: js.source,
      });
      while (offset < js.end) advance();
      continue;
    }
    if (
      source.startsWith("%,@(", offset) || source.startsWith("%,(", offset) ||
      value === "%" && source[offset + 1] === "`"
    ) {
      if (source.startsWith("%,@(", offset)) {
        for (let i = 0; i < 4; i++) advance();
        add("%,@", "splice", start);
        openSyntaxGroup(stack, "(", ")", start);
        continue;
      }
      if (source.startsWith("%,(", offset)) {
        for (let i = 0; i < 3; i++) advance();
        add("%,", "unquote", start);
        openSyntaxGroup(stack, "(", ")", start);
        continue;
      }
      if (value === "%") {
        advance();
        advance();
        add("%`", "quasiquote", start);
        continue;
      }
    }
    if (value === "%" && /[A-Za-z_]/.test(source[offset + 1] ?? "")) {
      let spelling = advance();
      while (/[A-Za-z0-9_]/.test(char())) spelling += advance();
      add(spelling, "macro", start, undefined, char() === "(");
      continue;
    }
    if (
      (value === "#" || value === "$") &&
      /[A-Za-z_]/.test(source[offset + 1] ?? "")
    ) {
      let spelling = advance();
      while (/[A-Za-z0-9_]/.test(char())) spelling += advance();
      add(spelling, value === "#" ? "symbol" : "fetch", start);
      continue;
    }
    if (
      value === "#" || value === "$" && source[offset + 1] !== "("
    ) {
      advance();
      throw new TossSyntaxError(loc(), "Expected a name.");
    }
    if (/[A-Za-z_]/.test(value)) {
      let spelling = advance();
      while (/[A-Za-z0-9_]/.test(char())) spelling += advance();
      if (char() === ":") spelling += advance();
      add(spelling, "ordinary", start);
      continue;
    }
    if (
      /[0-9]/.test(value) ||
      value === "-" && !stack.some((frame) => frame.open === "$(") &&
        /[0-9]/.test(source[offset + 1] ?? "")
    ) {
      let spelling = advance();
      while (/[0-9]/.test(char())) spelling += advance();
      if (char() === "." && /[0-9]/.test(source[offset + 1] ?? "")) {
        spelling += advance();
        while (/[0-9]/.test(char())) spelling += advance();
      }
      if (/[A-Za-z0-9_]/.test(char())) {
        throw new TossSyntaxError(start, "Invalid numeric literal.");
      }
      add(spelling, "number", start);
      continue;
    }
    if (source.startsWith("$(", offset)) {
      advance();
      advance();
      openSyntaxGroup(stack, "$(", ")", start);
      continue;
    }
    if ("([{ ".includes(value) && value !== " ") {
      advance();
      const close = value === "(" ? ")" : value === "[" ? "]" : "}";
      openSyntaxGroup(stack, value, close, start);
      continue;
    }
    if (")] }".includes(value) && value !== " ") {
      const top = stack.at(-1);
      if (top === undefined) {
        throw new TypeError("Syntax reader stack is empty.");
      }
      if (top.open === "") {
        advance();
        add(value, "ordinary", start);
        continue;
      }
      advance();
      closeSyntaxGroup(stack, value, start, origin);
      continue;
    }
    if (
      source.startsWith("->", offset) ||
      source.startsWith("|>", offset)
    ) {
      let spelling = advance();
      if (
        (spelling === "-" && char() === ">") ||
        (spelling === "|" && char() === ">")
      ) spelling += advance();
      add(spelling, "ordinary", start);
      continue;
    }
    if (",.:|+-*/%<>=!".includes(value)) {
      if (value === ",") bindingPrefix.comma(start, stack.length);
      let spelling = advance();
      if (
        (spelling === "<" || spelling === ">" || spelling === "=" ||
          spelling === "!") && char() === "="
      ) spelling += advance();
      add(spelling, "ordinary", start);
      continue;
    }
    throw new TossSyntaxError(
      start,
      `Unexpected character ${JSON.stringify(value)}.`,
    );
  }
  const open = stack.at(-1);
  if (open === undefined) throw new TypeError("Syntax reader stack is empty.");
  bindingPrefix.finish(loc());
  if (stack.length > 1 && options.deferUnclosedGroups !== true) {
    throw new TossSyntaxError(loc(), `Expected '${open.close}'.`);
  }
  return finishSyntaxGroups(stack, loc(), origin);
}
