import { TossSyntaxError } from "./diagnostic.ts";
import { LocalMacroRegistry } from "./macro_registry.ts";
import { readSyntax } from "./syntax_reader.ts";
import type { SyntaxNode } from "./syntax.ts";
import { isPeriod } from "./macro_import_syntax.ts";
import type { MacroDeclaration } from "./macro_compile.ts";

export type MacroLibraryGrammar = {
  readonly declaration: (
    nodes: readonly SyntaxNode[],
  ) => MacroDeclaration | undefined;
  readonly register: (
    declaration: MacroDeclaration,
    registry: LocalMacroRegistry,
  ) => void;
};

export function parseMacroLibrary(
  source: string,
  file: string,
  grammar: MacroLibraryGrammar,
): readonly LocalMacroRegistry["definitions"][number][] {
  const program = readSyntax(source, { file, deferUnclosedGroups: true });
  const registry = new LocalMacroRegistry();
  let statement: SyntaxNode[] = [];
  for (const node of program.children) {
    if (isPeriod(node)) {
      if (statement.length === 0) {
        throw new TossSyntaxError(
          node.origin.location,
          "Macro libraries cannot contain empty statements.",
        );
      } else {
        const declared = grammar.declaration(statement);
        if (declared === undefined) {
          const first = statement[0];
          if (first !== undefined) {
            throw new TossSyntaxError(
              first.origin.location,
              "Macro libraries may contain only standalone %macro declarations.",
            );
          }
        } else grammar.register(declared, registry);
      }
      statement = [];
    } else statement.push(node);
  }
  const trailing = statement[0];
  if (trailing !== undefined) {
    throw new TossSyntaxError(
      trailing.origin.location,
      "Macro library declaration must end with a period.",
    );
  }
  return registry.definitions;
}
