import { basename, dirname, extname, resolve } from "node:path";
import { type BundleModule, generateBundle } from "./codegen.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { analyzeModule, type ModuleImport } from "./module_analysis.ts";
import { parse } from "./parser.ts";

type LoadedModule = {
  readonly canonical: string;
  readonly expressions: ReturnType<typeof parse>;
  readonly imports: readonly ModuleImport[];
  readonly importIds: readonly number[];
};

function validatePath(path: string, location: ModuleImport["location"]): void {
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

export async function compileFile(
  input: string,
  output?: string,
): Promise<string> {
  const entryCanonical = await Deno.realPath(input);
  const modules: LoadedModule[] = [];
  const ids = new Map<string, number>();
  const edges: {
    readonly from: number;
    readonly to: number;
    readonly location: ModuleImport["location"];
  }[] = [];

  async function load(
    canonical: string,
    display: string,
    imported: boolean,
    importLocation?: ModuleImport["location"],
  ): Promise<number> {
    const existing = ids.get(canonical);
    if (existing !== undefined) return existing;
    const id = modules.length;
    ids.set(canonical, id);
    let source: string;
    try {
      source = await Deno.readTextFile(canonical);
    } catch (error) {
      if (
        importLocation === undefined ||
        !(error instanceof Deno.errors.NotFound ||
          error instanceof Deno.errors.NotCapable ||
          error instanceof Deno.errors.PermissionDenied ||
          error instanceof Deno.errors.IsADirectory ||
          error instanceof Deno.errors.NotADirectory)
      ) throw error;
      throw new TossSyntaxError(
        importLocation,
        `Unable to read imported file ${JSON.stringify(display)}.`,
      );
    }
    const expressions = parse(source, display);
    const analysis = analyzeModule(expressions, display, imported);
    modules.push({
      canonical,
      expressions,
      imports: analysis.imports,
      importIds: [],
    });
    const importIds: number[] = [];
    for (const dependency of analysis.imports) {
      validatePath(dependency.path, dependency.location);
      const candidate = resolve(dirname(canonical), dependency.path);
      let real: string;
      try {
        real = await Deno.realPath(candidate);
      } catch (error) {
        if (
          !(error instanceof Deno.errors.NotFound ||
            error instanceof Deno.errors.NotCapable ||
            error instanceof Deno.errors.PermissionDenied ||
            error instanceof Deno.errors.NotADirectory ||
            error instanceof Deno.errors.IsADirectory)
        ) throw error;
        const detail = error instanceof Deno.errors.NotFound
          ? "Imported file not found"
          : "Unable to resolve imported file";
        throw new TossSyntaxError(
          dependency.location,
          `${detail}: ${JSON.stringify(dependency.path)}.`,
        );
      }
      const dependencyId = await load(real, real, true, dependency.location);
      importIds.push(dependencyId);
      edges.push({ from: id, to: dependencyId, location: dependency.location });
    }
    modules[id] = {
      canonical,
      expressions,
      imports: analysis.imports,
      importIds,
    };
    return id;
  }

  const entry = await load(entryCanonical, input, false);
  if (output !== undefined) {
    const canonicalOutput = await outputPath(output);
    if (modules.some((module) => module.canonical === canonicalOutput)) {
      throw new TossSyntaxError(
        { file: input, line: 1, column: 1 },
        "Output must not overwrite a module source file.",
      );
    }
  }
  const visiting = new Set<number>();
  const visited = new Set<number>();
  function checkCycles(id: number): void {
    if (visiting.has(id)) return;
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of edges.filter((item) => item.from === id)) {
      if (visiting.has(edge.to)) {
        throw new TossSyntaxError(
          edge.location,
          "Static module dependency cycle detected.",
        );
      }
      checkCycles(edge.to);
    }
    visiting.delete(id);
    visited.add(id);
  }
  checkCycles(entry);

  const bundle: BundleModule[] = modules.map((module) => ({
    expressions: module.expressions,
    imports: module.imports.map((dependency, index) => {
      const resolvedId = module.importIds[index];
      if (resolvedId === undefined) {
        throw new TypeError("Resolved module id is missing.");
      }
      return { path: dependency.path, id: resolvedId };
    }),
  }));
  return generateBundle(bundle, entry);
}

async function outputPath(output: string): Promise<string> {
  const absolute = resolve(output);
  try {
    return await Deno.realPath(absolute);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
    const parent = dirname(absolute);
    if (parent === absolute) throw error;
    const realParent = await outputPath(parent);
    return resolve(realParent, basename(absolute));
  }
}
