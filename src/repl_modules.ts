import { dirname, extname, resolve } from "node:path";
import type { Expression } from "./ast.ts";
import { type BundleModule, generateModuleInitializer } from "./codegen.ts";
import { type SourceLocation, TossSyntaxError } from "./diagnostic.ts";
import { collectJavaScriptImportExpressions } from "./javascript_import_analysis.ts";
import { analyzeModule, type ModuleImport } from "./module_analysis.ts";
import { expandProgram } from "./macro_compile.ts";
import { createReplMacroImportState } from "./repl_macro_import.ts";

export type ReplModule = {
  readonly id: number;
  readonly canonical: string;
  readonly generated: string;
};
export type ReplModuleState = {
  readonly files: ReadonlyMap<string, ReplModule>;
  readonly nextId: number;
};
type CompiledImports = {
  readonly state: ReplModuleState;
  readonly modules: readonly ReplModule[];
  readonly imports: readonly { readonly path: string; readonly id: number }[];
  readonly javascriptImports: readonly {
    readonly specifier: string;
    readonly location: SourceLocation;
  }[];
};

export function compileReplModules(
  expressions: readonly Expression[],
  base: string,
  state: ReplModuleState,
): CompiledImports {
  const files = new Map(state.files);
  const visiting = new Set<string>();
  const modules: ReplModule[] = [];
  const moduleExpressions = new Map<string, readonly Expression[]>();
  let nextId = state.nextId;

  const load = (request: ModuleImport, directory: string): ReplModule => {
    validatePath(request.path, request.location);
    const candidate = resolve(directory, request.path);
    let canonical: string;
    try {
      canonical = Deno.realPathSync(candidate);
    } catch (error) {
      if (!isFilesystemError(error)) throw error;
      throw new TossSyntaxError(
        request.location,
        error instanceof Deno.errors.NotFound
          ? `Imported file not found: ${JSON.stringify(request.path)}.`
          : `Unable to resolve imported file ${JSON.stringify(request.path)}.`,
      );
    }
    if (visiting.has(canonical)) {
      throw new TossSyntaxError(
        request.location,
        "Static module dependency cycle detected.",
      );
    }
    const cached = files.get(canonical);
    if (cached !== undefined) return cached;
    visiting.add(canonical);
    try {
      let source: string;
      try {
        source = Deno.readTextFileSync(canonical);
      } catch (error) {
        if (!isFilesystemError(error)) throw error;
        throw new TossSyntaxError(
          request.location,
          error instanceof Deno.errors.NotFound
            ? `Imported file not found: ${JSON.stringify(request.path)}.`
            : `Unable to read imported file ${JSON.stringify(request.path)}.`,
        );
      }
      const start: SourceLocation = { file: canonical, line: 1, column: 1 };
      const imports = createReplMacroImportState(dirname(canonical)).resolve(
        source,
        canonical,
        start,
      );
      const expanded = expandProgram(source, { file: canonical, imports });
      const analysis = analyzeModule(expanded, canonical, true);
      moduleExpressions.set(canonical, expanded);
      const dependencies = analysis.imports.map((dependency) => ({
        path: dependency.path,
        id: load(dependency, dirname(canonical)).id,
      }));
      const bundle: BundleModule = {
        expressions: expanded,
        imports: dependencies,
      };
      const module = {
        id: nextId++,
        canonical,
        generated: generateModuleInitializer(bundle),
      };
      files.set(canonical, module);
      modules.push(module);
      return module;
    } finally {
      visiting.delete(canonical);
    }
  };

  const imports = analyzeModule(expressions, "<repl>", false).imports.map((
    item,
  ) => ({
    path: item.path,
    id: load(item, base).id,
  }));
  const seen = new Set<string>();
  const javascriptImports = [
    ...collectJavaScriptImportExpressions(expressions),
    ...[...moduleExpressions.values()].flatMap(
      collectJavaScriptImportExpressions,
    ),
  ].filter((item) => {
    if (seen.has(item.specifier)) return false;
    seen.add(item.specifier);
    return true;
  }).map((item) => ({ specifier: item.specifier, location: item.location }));
  return { state: { files, nextId }, modules, imports, javascriptImports };
}

function validatePath(path: string, location: SourceLocation): void {
  if (
    !(path.startsWith("./") || path.startsWith("../")) ||
    extname(path) !== ".toss"
  ) {
    throw new TossSyntaxError(
      location,
      "%import path must be relative and end in .toss.",
    );
  }
}

function isFilesystemError(error: unknown): boolean {
  return error instanceof Deno.errors.NotFound ||
    error instanceof Deno.errors.NotCapable ||
    error instanceof Deno.errors.PermissionDenied ||
    error instanceof Deno.errors.IsADirectory ||
    error instanceof Deno.errors.NotADirectory;
}
