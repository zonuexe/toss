import type { SyntaxGroup } from "./syntax.ts";
import { scanSyntax } from "./syntax_reader_scan.ts";

import type { SourceLocation } from "./diagnostic.ts";
import type { SyntaxScope } from "./syntax.ts";

export type SyntaxReadOptions = {
  readonly file: string;
  readonly scope?: SyntaxScope;
  readonly startLocation?: SourceLocation;
  readonly deferUnclosedGroups?: boolean;
  readonly javascriptBindingPrefix?: boolean;
};

export function readSyntax(
  source: string,
  options: SyntaxReadOptions,
): SyntaxGroup {
  return scanSyntax(source, options);
}
