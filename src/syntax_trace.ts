import {
  type SyntaxGroup,
  syntaxGroup,
  type SyntaxNode,
  syntaxToken,
} from "./syntax.ts";
import type { MacroState } from "./macro_value.ts";

export function appendSyntaxTrace(
  nodes: readonly SyntaxNode[],
  trace: SyntaxGroup["origin"]["trace"],
  state: MacroState,
): readonly SyntaxNode[] {
  return nodes.map((node) => appendNodeTrace(node, trace, state, 1));
}

function appendNodeTrace(
  node: SyntaxNode,
  trace: SyntaxGroup["origin"]["trace"],
  state: MacroState,
  depth: number,
): SyntaxNode {
  state.consumeSyntaxNode(node.origin.location, depth);
  const origin = {
    ...node.origin,
    trace: [
      ...node.origin.trace,
      ...trace.filter((entry) =>
        !node.origin.trace.some((existing) =>
          existing.name === entry.name &&
          existing.invocation.file === entry.invocation.file &&
          existing.invocation.line === entry.invocation.line &&
          existing.invocation.column === entry.invocation.column
        )
      ),
    ],
  };
  if (node.kind === "group") {
    return syntaxGroup(
      node.delimiter,
      node.children.map((child) =>
        appendNodeTrace(child, trace, state, depth + 1)
      ),
      origin,
      node.prefix,
      node.endLocation,
      node.closed,
    );
  }
  return syntaxToken(
    node.spelling,
    origin,
    node.flavor,
    node.rawJavaScript === undefined ? undefined : {
      prefix: node.rawJavaScript.prefix.map((child) =>
        appendNodeTrace(child, trace, state, depth + 1)
      ),
      source: node.rawJavaScript.source,
    },
    node.macroAdjacent,
  );
}
