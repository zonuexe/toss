import { createReplMacroImportState } from "./repl_macro_import.ts";
import { compileReplModules } from "./repl_modules.ts";
import type { ReplSessionHost } from "./repl_host.ts";

export function createDenoReplSessionHost(
  baseDirectory: string,
): ReplSessionHost {
  const macroImports = createReplMacroImportState(baseDirectory);
  return Object.freeze({
    baseDirectory: macroImports.baseDirectory,
    createMacroImportState: createReplMacroImportState,
    createModuleState: () => ({ files: new Map(), nextId: 0 }),
    compileModules: compileReplModules,
  });
}
