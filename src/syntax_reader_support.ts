import type { SourceLocation } from "./diagnostic.ts";
import {
  type SyntaxGroup,
  type SyntaxNode,
  type SyntaxScope,
} from "./syntax.ts";

export type PrefixReadOptions = {
  readonly source: string;
  readonly start: SourceLocation;
  readonly file: string;
  readonly scope: SyntaxScope;
};

export type SyntaxParser = (
  source: string,
  options: {
    readonly file: string;
    readonly scope: SyntaxScope;
    readonly startLocation: SourceLocation;
    readonly javascriptBindingPrefix?: boolean;
  },
) => SyntaxGroup;

export type SyntaxFrame = {
  readonly open: string;
  readonly close: string;
  readonly start: SourceLocation;
  readonly children: SyntaxNode[];
};

export function tossStringEnd(
  source: string,
  start: number,
): number | undefined {
  let index = start + 1;
  while (index < source.length) {
    const character = source[index] ?? "";
    if (character === "\\" && ["\\", "'"].includes(source[index + 1] ?? "")) {
      index += 2;
    } else if (character === "'") {
      return index + 1;
    } else index++;
  }
  return undefined;
}

export function readJavaScriptPrefix(
  options: PrefixReadOptions,
  parse: SyntaxParser,
): readonly SyntaxNode[] {
  return parse(options.source, {
    file: options.file,
    scope: options.scope,
    startLocation: options.start,
    javascriptBindingPrefix: options.source.length > 0,
  }).children;
}

export function locationAt(
  source: string,
  position: number,
  file: string,
  base?: SourceLocation,
): SourceLocation {
  let line = base?.line ?? 1;
  let column = base?.column ?? 1;
  for (let index = 0; index < position;) {
    const point = source.codePointAt(index);
    const part = point === undefined ? "" : String.fromCodePoint(point);
    if (part === "\r") {
      line++;
      column = 1;
      if (source[index + part.length] === "\n") index++;
    } else if (part === "\n") {
      line++;
      column = 1;
    } else column++;
    index += part.length;
  }
  return { file, line, column };
}
