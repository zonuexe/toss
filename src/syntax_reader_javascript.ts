import { readJavaScriptMacro } from "./javascript_parser.ts";
import type { SourceLocation } from "./diagnostic.ts";
import {
  locationAt,
  readJavaScriptPrefix,
  type SyntaxParser,
} from "./syntax_reader_support.ts";
import type { SyntaxNode, SyntaxScope } from "./syntax.ts";

export function readRawJavaScript(
  source: string,
  offset: number,
  file: string,
  scope: SyntaxScope,
  parse: SyntaxParser,
  startLocation?: SourceLocation,
): {
  readonly spelling: string;
  readonly prefix: readonly SyntaxNode[];
  readonly source: string;
  readonly end: number;
} {
  const js = readJavaScriptMacro(
    source,
    offset,
    (position) => locationAt(source, position, file, startLocation),
  );
  const spelling = source.slice(offset, js.end);
  const prefixStart = offset + 4;
  const prefix = readJavaScriptPrefix({
    source: js.prefix.replace(/;\s*$/, ""),
    start: locationAt(source, prefixStart, file, startLocation),
    file,
    scope,
  }, parse);
  return { spelling, prefix, source: js.source, end: js.end };
}
