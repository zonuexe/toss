import { generate, generateBundle } from "./codegen.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { analyzeModule } from "./module_analysis.ts";
import {
  expandProgram,
  findMacroImports,
  parseMacroLibrary,
  type ResolvedMacroImport,
} from "./macro_compile.ts";
import type { ModuleImport } from "./module_analysis.ts";
import {
  finalizeModuleGraph,
  type ModuleGraphEdge,
  normalizeVirtualSourceId,
  type ResolvedModuleGraphNode,
  resolveVirtualMacroSourceId,
  resolveVirtualSourceId,
} from "./module_graph.ts";
import {
  compileFormat,
  type CompileOptions,
  compileRuntimeImport,
  compileTreeShakePrelude,
} from "./compile_options.ts";

export type { CompileFormat, CompileOptions } from "./compile_options.ts";

type SourceModule = ResolvedModuleGraphNode;

/** Compile one Toss source without reading files or resolving imports. */
export function compile(
  source: string,
  file: string,
  options: CompileOptions = {},
): string {
  compileRuntimeImport(options);
  compileTreeShakePrelude(options);
  const expressions = expandProgram(source, { file });
  const format = compileFormat(options);
  const analysis = analyzeModule(expressions, file, false);
  const unresolved = analysis.imports[0];
  if (unresolved !== undefined) {
    throw new TossSyntaxError(
      unresolved.location,
      "%import requires compileFile or compileSources so its dependency can be resolved.",
    );
  }
  if (format === "esm" && analysis.exported === undefined) {
    throw new TossSyntaxError(
      expressions[0]?.location ?? { file, line: 1, column: 1 },
      "ES module output requires exactly one top-level %export.",
    );
  }
  return generate(expressions, options);
}

/**
 * Compile an entry and its local Toss or macro dependencies from a virtual
 * root-relative POSIX path map. Imports never read from or fetch the host.
 */
export function compileSources(
  entry: string,
  sources: ReadonlyMap<string, string>,
  options: CompileOptions = {},
): string {
  compileRuntimeImport(options);
  compileTreeShakePrelude(options);
  const format = compileFormat(options);
  const canonicalSources = new Map<string, string>();
  for (const [path, source] of sources) {
    const id = normalizeVirtualSourceId(path);
    if (canonicalSources.has(id)) {
      throw new TypeError(`Duplicate source map path: ${JSON.stringify(id)}.`);
    }
    canonicalSources.set(id, source);
  }
  const entryId = normalizeVirtualSourceId(entry);
  if (!canonicalSources.has(entryId)) {
    throw new TypeError(
      `Entry source is not present in the source map: ${
        JSON.stringify(entryId)
      }.`,
    );
  }

  const modules: SourceModule[] = [];
  const ids = new Map<string, number>();
  const edges: ModuleGraphEdge[] = [];
  let entryExport: ReturnType<typeof analyzeModule>["exported"];

  function load(
    canonical: string,
    imported: boolean,
    importLocation?: ModuleImport["location"],
  ): number {
    const existing = ids.get(canonical);
    if (existing !== undefined) return existing;
    const id = modules.length;
    ids.set(canonical, id);
    const source = canonicalSources.get(canonical);
    if (source === undefined) {
      if (importLocation === undefined) {
        throw new TypeError("Entry source disappeared from the source map.");
      }
      throw new TossSyntaxError(
        importLocation,
        `Imported file not found: ${JSON.stringify(canonical)}.`,
      );
    }

    const macroImports: ResolvedMacroImport[] = [];
    const importedLibraries = new Set<string>();
    for (const request of findMacroImports(source, canonical)) {
      const libraryId = resolveVirtualMacroSourceId(
        canonical,
        request.path,
        request.location,
      );
      const librarySource = canonicalSources.get(libraryId);
      if (librarySource === undefined) {
        throw new TossSyntaxError(
          request.location,
          `Macro library not found: ${JSON.stringify(request.path)}.`,
        );
      }
      if (importedLibraries.has(libraryId)) {
        macroImports.push({ location: request.location, definitions: [] });
        continue;
      }
      importedLibraries.add(libraryId);
      macroImports.push({
        location: request.location,
        definitions: parseMacroLibrary(librarySource, libraryId),
      });
    }

    const expressions = expandProgram(source, {
      file: canonical,
      imports: macroImports,
    });
    const analysis = analyzeModule(expressions, canonical, imported);
    if (!imported) entryExport = analysis.exported;
    modules.push({ expressions, imports: analysis.imports, importIds: [] });
    const importIds: number[] = [];
    for (const dependency of analysis.imports) {
      const dependencyId = resolveVirtualSourceId(
        canonical,
        dependency.path,
        dependency.location,
      );
      if (!canonicalSources.has(dependencyId)) {
        throw new TossSyntaxError(
          dependency.location,
          `Imported file not found: ${JSON.stringify(dependency.path)}.`,
        );
      }
      const resolvedId = load(dependencyId, true, dependency.location);
      importIds.push(resolvedId);
      edges.push({ from: id, to: resolvedId, location: dependency.location });
    }
    modules[id] = { expressions, imports: analysis.imports, importIds };
    return id;
  }

  const loadedEntry = load(entryId, false);
  if (format === "esm" && entryExport === undefined) {
    throw new TossSyntaxError(
      modules[loadedEntry]?.expressions[0]?.location ?? {
        file: entryId,
        line: 1,
        column: 1,
      },
      "ES module output requires exactly one top-level %export.",
    );
  }
  return generateBundle(
    finalizeModuleGraph(modules, loadedEntry, edges),
    loadedEntry,
    options,
  );
}
