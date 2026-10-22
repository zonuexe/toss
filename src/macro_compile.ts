import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { expandSyntax } from "./macro_expand_tree.ts";
import { LocalMacroRegistry } from "./macro_registry.ts";
import { parseSyntaxExpression } from "./macro_syntax_parse.ts";
import { readSyntax } from "./syntax_reader.ts";
import { parseTokens } from "./parser.ts";
import { tokensFromSyntax } from "./syntax_tokens.ts";
import { type SyntaxGroup, syntaxGroup, type SyntaxNode } from "./syntax.ts";

const BUILTINS = new Set([
  "quote",
  "js",
  "jsImport",
  "import",
  "export",
  "extend",
  "super",
  "async",
  "await",
]);
type MacroDeclaration = {
  readonly name: string;
  readonly blockSyntax: SyntaxGroup;
  readonly location: SyntaxGroup["origin"]["location"];
};

export function expandProgram(
  source: string,
  file: string,
): readonly Expression[] {
  const program = readSyntax(source, { file, deferUnclosedGroups: true });
  const registry = new LocalMacroRegistry();
  const expressions: Expression[] = [];
  let statement: SyntaxNode[] = [];
  for (const node of program.children) {
    if (
      node.kind === "token" && node.spelling === "." &&
      node.flavor === "ordinary"
    ) {
      if (statement.length === 0) {
        throw new TossSyntaxError(
          node.origin.location,
          "Expected an expression.",
        );
      }
      const declared = declaration(statement);
      if (declared === undefined) {
        const expanded = expandSyntax(statement, registry);
        rejectGeneratedDeclarations(expanded);
        if (expanded.length > 0) {
          expressions.push(
            parseSyntaxExpression(
              expanded,
              statement[0]?.origin.location ?? node.origin.location,
              node.origin.location,
            ),
          );
        }
      } else {
        register(declared, registry);
      }
      statement = [];
    } else statement.push(node);
  }
  if (statement.length > 0) {
    const declared = declaration(statement);
    if (declared !== undefined) {
      throw new TossSyntaxError(
        declared.location,
        "%macro declaration must end with a period.",
      );
    }
    const expanded = expandSyntax(statement, registry);
    rejectGeneratedDeclarations(expanded);
    const origin = expanded[0]?.origin ?? statement[0]?.origin ??
      program.origin;
    const fragment = syntaxGroup(
      "",
      expanded,
      origin,
      "",
      program.endLocation,
    );
    const converted = tokensFromSyntax(fragment);
    parseTokens(converted.tokens, converted.end, file);
  }
  return expressions;
}

function declaration(
  nodes: readonly SyntaxNode[],
): MacroDeclaration | undefined {
  const head = nodes[0];
  if (
    head?.kind !== "token" || head.spelling !== "%macro" ||
    !head.macroAdjacent
  ) return undefined;
  const form = nodes[1];
  if (nodes.length !== 2 || form?.kind !== "group" || form.delimiter !== "()") {
    throw new TossSyntaxError(
      head.origin.location,
      "Expected standalone %macro(#name, { parameter -> ... }). declaration.",
    );
  }
  const children = form.children;
  const name = children[0];
  const comma = children[1];
  const block = children[2];
  if (
    children.length !== 3 || name?.kind !== "token" ||
    name.flavor !== "symbol" ||
    comma?.kind !== "token" || comma.spelling !== "," ||
    block?.kind !== "group" || block.delimiter !== "{}"
  ) {
    throw new TossSyntaxError(
      head.origin.location,
      "%macro requires a literal Named Symbol and a literal Block.",
    );
  }
  return {
    name: name.spelling.slice(1),
    blockSyntax: block,
    location: head.origin.location,
  };
}

function register(
  declaration: MacroDeclaration,
  registry: LocalMacroRegistry,
): void {
  if (BUILTINS.has(declaration.name) || declaration.name === "macro") {
    throw new TossSyntaxError(
      declaration.location,
      `Cannot replace built-in macro %${declaration.name}.`,
    );
  }
  if (
    registry.definitions.some((definition) =>
      definition.name === declaration.name
    )
  ) {
    throw new TossSyntaxError(
      declaration.location,
      `Duplicate macro %${declaration.name}.`,
    );
  }
  const preparedNodes = expandSyntax(
    declaration.blockSyntax.children,
    registry,
    0,
    declaration.name,
  );
  const preparedGroup = syntaxGroup(
    "{}",
    preparedNodes,
    declaration.blockSyntax.origin,
  );
  const expression = parseSyntaxExpression(
    [preparedGroup],
    declaration.location,
  );
  if (expression.kind !== "block" || expression.parameters.length !== 1) {
    throw new TossSyntaxError(
      declaration.location,
      "Macro expander must be a literal Block with exactly one parameter.",
    );
  }
  registry.register({
    name: declaration.name,
    block: expression,
    location: declaration.location,
    bodyStart: declaration.blockSyntax.origin.location,
    bodyEnd: preparedNodes.at(-1)?.origin.location ??
      declaration.blockSyntax.origin.location,
  });
}

function rejectGeneratedDeclarations(nodes: readonly SyntaxNode[]): void {
  const visit = (node: SyntaxNode): void => {
    if (
      node.kind === "token" && node.flavor === "macro" &&
      (node.spelling === "%macro" || node.spelling === "%export") &&
      (node.origin.trace.length > 0 || node.spelling === "%macro")
    ) {
      throw new TossSyntaxError(
        node.origin.location,
        `${node.spelling} cannot be generated by a macro.`,
      );
    }
    if (node.kind === "group") node.children.forEach(visit);
    if (node.kind === "token") node.rawJavaScript?.prefix.forEach(visit);
  };
  nodes.forEach(visit);
}
