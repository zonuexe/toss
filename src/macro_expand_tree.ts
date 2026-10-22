import type { Expression } from "./ast.ts";
import { mergeMacroTrace, TossSyntaxError } from "./diagnostic.ts";
import { evaluateMacroExpression } from "./macro_evaluate.ts";
import { invokeMacroBlock } from "./macro_primitive.ts";
import { LocalMacroRegistry } from "./macro_registry.ts";
import {
  macroRootEnvironment,
  MacroState,
  type MacroValue,
} from "./macro_value.ts";
import { isMacroSyntax } from "./macro_syntax.ts";
import { parseSyntaxExpression } from "./macro_syntax_parse.ts";
import { parseMacroQuoteHole } from "./macro_quote.ts";
import {
  type SyntaxGroup,
  syntaxGroup,
  type SyntaxNode,
  syntaxToken,
} from "./syntax.ts";
import { appendSyntaxTrace } from "./syntax_trace.ts";
import { rejectGeneratedMacroImport } from "./macro_import_syntax.ts";

const LIMIT = 10000;

export function expandSyntax(
  nodes: readonly SyntaxNode[],
  registry: LocalMacroRegistry,
  depth = 0,
  activeDefinition?: string,
): readonly SyntaxNode[] {
  const output: SyntaxNode[] = [];
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node === undefined) continue;
    const following = nodes[index + 1];
    if (
      node.kind === "token" && node.flavor === "macro" &&
      node.spelling === "%macro"
    ) {
      throw new TossSyntaxError(
        node.origin.location,
        "%macro is only valid as a file-root declaration.",
      );
    }
    if (
      node.kind === "token" && node.flavor === "quasiquote" &&
      following?.kind === "group"
    ) {
      output.push(node, following);
      index++;
      continue;
    }
    if (
      node.kind === "token" && node.flavor === "macro" &&
      following?.kind === "group" && node.macroAdjacent &&
      following.delimiter === "()"
    ) {
      if (
        [
          "%quote",
          "%js",
          "%jsImport",
          "%import",
          "%export",
          "%extend",
          "%super",
          "%async",
          "%await",
          "%macroImport",
        ].includes(node.spelling)
      ) {
        if (node.spelling === "%quote" || node.spelling === "%macroImport") {
          output.push(node, following);
        } else {
          output.push(
            node,
            cloneGroup(
              following,
              expandSyntax(
                following.children,
                registry,
                depth,
                activeDefinition,
              ),
            ),
          );
        }
      } else {
        const name = node.spelling.slice(1);
        const definition = registry.available(name, node.origin.location);
        if (definition === undefined) {
          throw new TossSyntaxError(
            node.origin.location,
            `Macro ${node.spelling} is not defined at this source position.`,
          );
        }
        if (
          activeDefinition === name &&
          node.origin.scope.kind !== "introduced" &&
          node.origin.location.line === definition.location.line
        ) {
          throw new TossSyntaxError(
            node.origin.location,
            `Macro ${node.spelling} directly expands itself while preparing its definition.`,
          );
        }
        registry.expansions++;
        if (registry.expansions > LIMIT) {
          throw new TossSyntaxError(
            node.origin.location,
            `Macro ${node.spelling} expansion count limit exceeded.`,
          );
        }
        if (depth >= 128) {
          throw new TossSyntaxError(
            node.origin.location,
            `Macro ${node.spelling} expansion depth limit exceeded.`,
          );
        }
        const syntax = syntaxGroup(
          "",
          following.children,
          following.origin,
          "",
          following.endLocation,
        );
        const trace = [...node.origin.trace, {
          name: definition.name,
          definition: definition.location,
          invocation: node.origin.location,
        }];
        let nested: readonly SyntaxNode[];
        try {
          const expanded = invoke(
            definition.block,
            syntax,
            definition.name,
            definition.location,
            node.origin.location,
            registry,
            depth + 1,
          );
          nested = expandSyntax(
            expanded,
            registry,
            depth + 1,
            activeDefinition,
          );
          rejectGeneratedMacroImport(nested);
          parseSyntaxExpression(nested, node.origin.location);
        } catch (error) {
          if (!(error instanceof TossSyntaxError)) throw error;
          throw new TossSyntaxError(
            error.location,
            error.reason,
            mergeMacroTrace(trace, error.trace),
          );
        }
        output.push(syntaxGroup("()", nested, node.origin));
      }
      index++;
      continue;
    }
    if (node.kind === "group") {
      output.push(
        cloneGroup(
          node,
          expandSyntax(node.children, registry, depth, activeDefinition),
        ),
      );
    } else if (node.rawJavaScript !== undefined) {
      output.push(syntaxToken(node.spelling, node.origin, node.flavor, {
        prefix: expandSyntax(
          node.rawJavaScript.prefix,
          registry,
          depth,
          activeDefinition,
        ),
        source: node.rawJavaScript.source,
      }, node.macroAdjacent));
    } else output.push(node);
  }
  return output;
}

function invoke(
  block: Extract<Expression, { readonly kind: "block" }>,
  input: SyntaxGroup,
  name: string,
  definition: SyntaxGroup["origin"]["location"],
  invocation: SyntaxGroup["origin"]["location"],
  registry: LocalMacroRegistry,
  depth: number,
): readonly SyntaxNode[] {
  const trace = [...(input.origin.trace ?? []), {
    name,
    definition,
    invocation,
  }];
  const introducedScope = { kind: "introduced" as const, id: ++scopeId };
  const parseHole = (group: SyntaxGroup): Expression => {
    const children = expandSyntax(group.children, registry, depth, name);
    return parseMacroQuoteHole(
      syntaxGroup(group.delimiter, children, group.origin),
    );
  };
  const environment = macroRootEnvironment();
  const context = {
    state: new MacroState(),
    environment,
    scopes: new Map([[0, environment]]),
    rootEnvironment: environment,
    location: invocation,
    quotation: { introducedScope, trace, parseHole },
  };
  try {
    const callable = evaluateMacroExpression(block, context);
    const result: MacroValue = invokeMacroBlock(callable, [input], context);
    if (!isMacroSyntax(result)) {
      throw new TossSyntaxError(
        invocation,
        `Macro %${name} must return a SyntaxNode.`,
      );
    }
    const output = result.kind === "group" && result.delimiter === ""
      ? result.children
      : [result];
    return appendSyntaxTrace(output, trace, context.state);
  } catch (error) {
    if (error instanceof TossSyntaxError) {
      throw new TossSyntaxError(
        error.location,
        error.reason,
        mergeMacroTrace(error.trace, trace),
      );
    }
    throw error;
  }
}

let scopeId = 0;

function cloneGroup(
  group: SyntaxGroup,
  children: readonly SyntaxNode[],
): SyntaxGroup {
  return syntaxGroup(
    group.delimiter,
    children,
    group.origin,
    group.prefix,
    group.endLocation,
    group.closed,
  );
}
