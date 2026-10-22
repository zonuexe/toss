import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { expandSyntax } from "./macro_expand_tree.ts";
import { LocalMacroRegistry } from "./macro_registry.ts";
import { parseSyntaxExpression } from "./macro_syntax_parse.ts";
import { readSyntax } from "./syntax_reader.ts";
import { parseTokens } from "./parser.ts";
import { tokensFromSyntax } from "./syntax_tokens.ts";
import { type SyntaxGroup, syntaxGroup, type SyntaxNode } from "./syntax.ts";
import {
  macroImport,
  registerImported,
  type ResolvedMacroImport,
  sameLocation,
} from "./macro_import_syntax.ts";
import { parseMacroLibrary as parseLibrary } from "./macro_library.ts";
import {
  declaration,
  register,
  rejectGeneratedDeclarations,
  rejectReplForms,
} from "./macro_declaration.ts";
import type { SourceLocation } from "./diagnostic.ts";
export type { ResolvedMacroImport } from "./macro_import_syntax.ts";
export type { MacroDeclaration } from "./macro_declaration.ts";
export { LocalMacroRegistry } from "./macro_registry.ts";
export { findMacroImports } from "./macro_import_syntax.ts";

export type MacroCompilationContext = {
  readonly file: string;
  readonly imports?: readonly ResolvedMacroImport[];
  readonly registry?: LocalMacroRegistry;
  readonly startLocation?: SourceLocation;
  readonly repl?: boolean;
};

export function expandProgram(
  source: string,
  context: MacroCompilationContext,
): readonly Expression[] {
  const program = readSyntax(source, {
    file: context.file,
    deferUnclosedGroups: true,
    ...(context.startLocation === undefined
      ? {}
      : { startLocation: context.startLocation }),
  });
  const registry = context.registry ?? new LocalMacroRegistry();
  registry.expansions = 0;
  if (context.repl === true) rejectReplForms(program.children);
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
      const imported = macroImport(statement);
      if (imported !== undefined) {
        const resolved = (context.imports ?? []).find((item) =>
          sameLocation(item.location, imported.location)
        );
        if (resolved === undefined) {
          throw new TossSyntaxError(
            imported.location,
            "%macroImport requires compileFile so its library can be resolved.",
          );
        }
        for (const definition of resolved.definitions) {
          registerImported(definition, imported.location, registry);
        }
      } else if (declared === undefined) {
        const expanded = expandSyntax(statement, registry);
        rejectGeneratedDeclarations(expanded);
        if (context.repl === true) rejectReplForms(expanded);
        if (expanded.length > 0) {
          expressions.push(parseSyntaxExpression(
            expanded,
            statement[0]?.origin.location ?? node.origin.location,
            node.origin.location,
          ));
        }
      } else register(declared, registry);
      statement = [];
    } else statement.push(node);
  }
  validatePending(statement, program, {
    registry,
    repl: context.repl === true,
  });
  return expressions;
}

function validatePending(
  statement: readonly SyntaxNode[],
  program: SyntaxGroup,
  context: {
    readonly registry: LocalMacroRegistry;
    readonly repl: boolean;
  },
): void {
  if (statement.length === 0) return;
  const imported = macroImport(statement);
  if (imported !== undefined) {
    throw new TossSyntaxError(
      imported.location,
      "%macroImport declaration must end with a period.",
    );
  }
  const declared = declaration(statement);
  if (declared !== undefined) {
    throw new TossSyntaxError(
      declared.location,
      "%macro declaration must end with a period.",
    );
  }
  const expanded = expandSyntax(statement, context.registry);
  rejectGeneratedDeclarations(expanded);
  if (context.repl) rejectReplForms(expanded);
  const fragment = syntaxGroup(
    "",
    expanded,
    expanded[0]?.origin ?? statement[0]?.origin ?? program.origin,
    "",
    program.endLocation,
  );
  const converted = tokensFromSyntax(fragment);
  parseTokens(converted.tokens, converted.end, program.origin.location.file);
}

export function parseMacroLibrary(
  source: string,
  file: string,
): readonly LocalMacroRegistry["definitions"][number][] {
  return parseLibrary(source, file, { declaration, register });
}
