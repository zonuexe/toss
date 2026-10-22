import type { SyntaxGroup, SyntaxNode, SyntaxOrigin } from "./syntax.ts";

export type FlattenedSyntax = {
  readonly source: string;
  readonly origins: readonly SyntaxRange[];
};
export type SyntaxRange = {
  readonly start: number;
  readonly end: number;
  readonly origin: SyntaxOrigin;
};

export function flattenSyntax(fragment: SyntaxNode): FlattenedSyntax {
  let source = "";
  const origins: SyntaxRange[] = [];
  const children = new WeakMap<SyntaxGroup, readonly SyntaxNode[]>();
  const getChildren = (group: SyntaxGroup): readonly SyntaxNode[] => {
    const existing = children.get(group);
    if (existing !== undefined) return existing;
    const value = [...group.children];
    children.set(group, value);
    return value;
  };
  const write = (node: SyntaxNode): void => {
    if (node.kind === "group") {
      const open = node.delimiter === "()"
        ? "("
        : node.delimiter === "[]"
        ? "["
        : node.delimiter === "{}"
        ? "{"
        : "";
      const close = node.delimiter === "()"
        ? ")"
        : node.delimiter === "[]"
        ? "]"
        : node.delimiter === "{}"
        ? "}"
        : "";
      const start = source.length;
      source += node.prefix + open;
      const items = getChildren(node);
      for (let index = 0; index < items.length; index++) {
        const child = items[index];
        if (child === undefined) continue;
        const previous = items[index - 1];
        if (previous !== undefined && needsSeparator(previous, child)) {
          source += " ";
        }
        write(child);
      }
      source += close;
      origins.push(
        Object.freeze({ start, end: source.length, origin: node.origin }),
      );
      return;
    }
    const start = source.length;
    if (node.rawJavaScript !== undefined) {
      const prefix =
        flattenSyntax(syntaxFragment(node, node.rawJavaScript.prefix))
          .source;
      source += `%js(${prefix}${
        prefix.length === 0 ? "" : "; "
      }${node.rawJavaScript.source})`;
    } else source += node.spelling;
    origins.push(
      Object.freeze({ start, end: source.length, origin: node.origin }),
    );
  };
  write(fragment);
  return Object.freeze({ source, origins: Object.freeze(origins) });
}

function syntaxFragment(
  token: Extract<SyntaxNode, { readonly kind: "token" }>,
  children: readonly SyntaxNode[],
): SyntaxGroup {
  return {
    kind: "group",
    delimiter: "",
    prefix: "",
    children,
    origin: token.origin,
  };
}

function needsSeparator(left: SyntaxNode, right: SyntaxNode): boolean {
  if (
    left.kind === "token" && right.kind === "group" &&
    left.flavor === "macro" && left.macroAdjacent
  ) return false;
  if (
    left.kind === "token" && right.kind === "group" &&
    left.flavor === "macro"
  ) return true;
  if (
    left.kind === "token" && right.kind === "group" &&
    (left.flavor === "unquote" || left.flavor === "splice")
  ) return false;
  if (
    left.kind === "token" && right.kind === "group" &&
    left.flavor === "quasiquote"
  ) return false;
  if (left.kind === "token" && right.kind === "group" && right.prefix === "$") {
    return false;
  }
  if (left.kind === "group") return true;
  if (right.kind === "group") {
    return !(right.prefix === "$" || left.kind === "token" &&
        (left.flavor === "unquote" || left.flavor === "splice" ||
          left.flavor === "quasiquote" || left.flavor === "arithmetic"));
  }
  if (
    (left.spelling === "." && right.flavor === "number") ||
    (left.flavor === "number" && right.spelling === ".")
  ) return true;
  if (left.spelling === "=" || right.spelling === "=") return true;
  const pair = `${left.spelling}${right.spelling}`;
  if (
    ["//", "/*", "->", "|>", "<=", ">=", "==", "!=", "++", "--", "**"].includes(
      pair,
    )
  ) {
    return true;
  }
  const l = left.spelling.at(-1) ?? "";
  const r = right.spelling[0] ?? "";
  return /[A-Za-z0-9_#$%]/.test(l) && /[A-Za-z0-9_#$%]/.test(r);
}
