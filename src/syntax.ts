import type { SourceLocation } from "./diagnostic.ts";

export type SyntaxScope = {
  readonly kind: "definition" | "caller" | "introduced";
  readonly id: number;
};

export type SyntaxOrigin = {
  readonly location: SourceLocation;
  readonly scope: SyntaxScope;
  readonly trace: readonly MacroTrace[];
};

export type SyntaxTokenFlavor =
  | "ordinary"
  | "number"
  | "string"
  | "symbol"
  | "fetch"
  | "macro"
  | "quote"
  | "quasiquote"
  | "unquote"
  | "splice"
  | "arithmetic"
  | "rawJavaScript";

export type MacroTrace = {
  readonly name: string;
  readonly definition: SourceLocation;
  readonly invocation: SourceLocation;
};

export type SyntaxToken = {
  readonly kind: "token";
  readonly spelling: string;
  readonly origin: SyntaxOrigin;
  readonly flavor: SyntaxTokenFlavor;
  readonly macroAdjacent?: boolean;
  readonly rawJavaScript?: {
    readonly prefix: readonly SyntaxNode[];
    readonly source: string;
  };
};

export type SyntaxGroup = {
  readonly kind: "group";
  readonly delimiter: "()" | "[]" | "{}" | "";
  readonly prefix: string;
  readonly children: readonly SyntaxNode[];
  readonly origin: SyntaxOrigin;
  readonly endLocation?: SourceLocation;
  readonly closed?: boolean;
};

export type SyntaxNode = SyntaxToken | SyntaxGroup;

export function syntaxToken(
  spelling: string,
  origin: SyntaxOrigin,
  flavor: SyntaxTokenFlavor = "ordinary",
  rawJavaScript?: SyntaxToken["rawJavaScript"],
  macroAdjacent?: boolean,
): SyntaxToken {
  return Object.freeze({
    kind: "token",
    spelling,
    origin: freezeOrigin(origin),
    flavor,
    ...(macroAdjacent === undefined ? {} : { macroAdjacent }),
    ...(rawJavaScript === undefined ? {} : {
      rawJavaScript: Object.freeze({
        prefix: Object.freeze([...rawJavaScript.prefix]),
        source: rawJavaScript.source,
      }),
    }),
  });
}

export function syntaxGroup(
  delimiter: SyntaxGroup["delimiter"],
  children: readonly SyntaxNode[],
  origin: SyntaxOrigin,
  prefix = "",
  endLocation?: SourceLocation,
  closed = true,
): SyntaxGroup {
  const immutableChildren = Object.freeze([...children]);
  return Object.freeze({
    kind: "group",
    delimiter,
    prefix,
    get children(): readonly SyntaxNode[] {
      return [...immutableChildren];
    },
    origin: freezeOrigin(origin),
    ...(endLocation === undefined
      ? {}
      : { endLocation: Object.freeze({ ...endLocation }) }),
    closed,
  });
}

function freezeOrigin(origin: SyntaxOrigin): SyntaxOrigin {
  return Object.freeze({
    location: Object.freeze({ ...origin.location }),
    scope: Object.freeze({ ...origin.scope }),
    trace: Object.freeze(
      origin.trace.map((entry) =>
        Object.freeze({
          name: entry.name,
          definition: Object.freeze({ ...entry.definition }),
          invocation: Object.freeze({ ...entry.invocation }),
        })
      ),
    ),
  });
}

export function syntaxChildren(node: SyntaxNode): readonly SyntaxNode[] {
  if (node.kind !== "group") {
    throw new TypeError("Syntax children requires a group.");
  }
  return [...node.children];
}

export function syntaxDelimiter(node: SyntaxNode): SyntaxGroup["delimiter"] {
  if (node.kind !== "group") {
    throw new TypeError("Syntax delimiter requires a group.");
  }
  return node.delimiter;
}

export function syntaxSpelling(node: SyntaxNode): string {
  if (node.kind !== "token") {
    throw new TypeError("Syntax spelling requires a token.");
  }
  return node.spelling;
}
