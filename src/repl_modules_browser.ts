import type { Expression } from "./ast.ts";
import { type BundleModule, generateModuleInitializer } from "./codegen.ts";
import type { SourceLocation } from "./diagnostic.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { collectJavaScriptImportExpressions } from "./javascript_import_analysis.ts";
import {
  expandProgram,
  findMacroImports,
  parseMacroLibrary,
  type ResolvedMacroImport,
} from "./macro_compile.ts";
import { analyzeModule, type ModuleImport } from "./module_analysis.ts";
import {
  resolveVirtualMacroSourceId,
  resolveVirtualSourceId,
} from "./module_graph.ts";
import type {
  ReplMacroImportState,
  ReplModule,
  ReplModuleCandidate,
  ReplModuleState,
  ReplSourceSnapshot,
} from "./repl_host.ts";
import type { LocalMacroDefinition } from "./macro_registry.ts";

const replSourceId = "repl.toss";
type MacroDefinitions = readonly LocalMacroDefinition[];

export function createBrowserMacroImportState(
  baseDirectory: string,
  cached: ReadonlyMap<string, MacroDefinitions> = new Map(),
  snapshot?: ReplSourceSnapshot,
): ReplMacroImportState {
  const libraries = new Map(cached);

  const copy = (nextSnapshot?: ReplSourceSnapshot): ReplMacroImportState =>
    createBrowserMacroImportState(baseDirectory, libraries, nextSnapshot);
  const resolve = (
    source: string,
    file: string,
    startLocation: SourceLocation,
  ) =>
    resolveMacroImports(
      source,
      file,
      startLocation,
      snapshot,
      libraries,
    );
  return Object.freeze({ baseDirectory, copy, resolve });
}

function resolveMacroImports(
  source: string,
  file: string,
  startLocation: SourceLocation,
  snapshot: ReplSourceSnapshot | undefined,
  libraries: Map<string, MacroDefinitions>,
): readonly ResolvedMacroImport[] {
  const requests = findMacroImports(source, file, startLocation);
  if (requests.length === 0) return [];
  return requests.map((request) => {
    if (snapshot?.hasSources !== true) {
      if (snapshot !== undefined) {
        snapshot.getSources(request.location, "macro");
      }
      throw new TossSyntaxError(
        request.location,
        "%macroImport is unavailable in the browser REPL core.",
      );
    }
    const parent = file === "<repl>" ? replSourceId : file;
    const canonical = resolveVirtualMacroSourceId(
      parent,
      request.path,
      request.location,
    );
    const cached = libraries.get(canonical);
    if (cached !== undefined) {
      return { location: request.location, definitions: [] };
    }
    if (snapshot === undefined) {
      throw new TossSyntaxError(
        request.location,
        "%macroImport is unavailable in the browser REPL core.",
      );
    }
    const sources = snapshot.getSources(request.location, "macro");
    const librarySource = sources.get(canonical);
    if (librarySource === undefined) {
      throw new TossSyntaxError(
        request.location,
        `Macro library not found: ${JSON.stringify(request.path)}.`,
      );
    }
    const definitions = parseMacroLibrary(librarySource, canonical);
    libraries.set(canonical, definitions);
    return { location: request.location, definitions };
  });
}

export function compileBrowserReplModules(
  expressions: readonly Expression[],
  _baseDirectory: string,
  state: ReplModuleState,
  snapshot?: ReplSourceSnapshot,
): ReplModuleCandidate {
  const rootImports = analyzeModule(expressions, "<repl>", false).imports;
  const files = new Map(state.files);
  const visiting = new Set<string>();
  const compiled: ReplModule[] = [];
  const moduleExpressions = new Map<string, readonly Expression[]>();
  let nextId = state.nextId;

  const load = (request: ModuleImport, parentId: string): ReplModule => {
    if (snapshot?.hasSources !== true) {
      if (snapshot !== undefined) {
        snapshot.getSources(request.location, "module");
      }
      throw new TossSyntaxError(
        request.location,
        "%import is unavailable in the browser REPL core.",
      );
    }
    const canonical = resolveVirtualSourceId(
      parentId,
      request.path,
      request.location,
    );
    if (visiting.has(canonical)) {
      throw new TossSyntaxError(
        request.location,
        "Static module dependency cycle detected.",
      );
    }
    const cached = files.get(canonical);
    if (cached !== undefined) return cached;
    const sources = snapshot.getSources(request.location, "module");
    const source = sources.get(canonical);
    if (source === undefined) {
      throw new TossSyntaxError(
        request.location,
        `Imported file not found: ${JSON.stringify(request.path)}.`,
      );
    }
    visiting.add(canonical);
    try {
      const start = { file: canonical, line: 1, column: 1 };
      const macroImports = resolveModuleMacroImports(
        source,
        canonical,
        start,
        snapshot,
      );
      const expanded = expandProgram(source, {
        file: canonical,
        imports: macroImports,
      });
      const analysis = analyzeModule(expanded, canonical, true);
      moduleExpressions.set(canonical, expanded);
      const dependencies = analysis.imports.map((dependency) => ({
        path: dependency.path,
        id: load(dependency, canonical).id,
      }));
      const module: ReplModule = {
        id: nextId++,
        canonical,
        generated: generateModuleInitializer(
          {
            expressions: expanded,
            imports: dependencies,
          } satisfies BundleModule,
        ),
      };
      files.set(canonical, module);
      compiled.push(module);
      return module;
    } finally {
      visiting.delete(canonical);
    }
  };

  const imports = rootImports.map((request) => ({
    path: request.path,
    id: load(request, replSourceId).id,
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
  return {
    state: { files, nextId },
    modules: compiled,
    imports,
    javascriptImports,
  };
}

function resolveModuleMacroImports(
  source: string,
  file: string,
  start: SourceLocation,
  snapshot: ReplSourceSnapshot,
): readonly ResolvedMacroImport[] {
  const libraries = new Map<string, MacroDefinitions>();
  return resolveMacroImports(source, file, start, snapshot, libraries);
}
