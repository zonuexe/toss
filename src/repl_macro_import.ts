import { resolve as resolvePath } from "node:path";
import type { SourceLocation } from "./diagnostic.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import {
  findMacroImports,
  parseMacroLibrary,
  type ResolvedMacroImport,
} from "./macro_compile.ts";
import type { LocalMacroDefinition } from "./macro_registry.ts";

export type ReplMacroImportState = {
  readonly baseDirectory: string;
  readonly copy: () => ReplMacroImportState;
  readonly resolve: (
    source: string,
    file: string,
    startLocation: SourceLocation,
  ) => readonly ResolvedMacroImport[];
};

export function createReplMacroImportState(
  baseDirectory = Deno.cwd(),
  cached: ReadonlyMap<string, readonly LocalMacroDefinition[]> = new Map(),
): ReplMacroImportState {
  const canonicalBase = resolvePath(baseDirectory);
  const libraries = new Map(cached);
  const copy = (): ReplMacroImportState =>
    createReplMacroImportState(canonicalBase, libraries);

  const resolveImports = (
    source: string,
    file: string,
    startLocation: SourceLocation,
  ): readonly ResolvedMacroImport[] => {
    const imports: ResolvedMacroImport[] = [];
    for (const request of findMacroImports(source, file, startLocation)) {
      const candidate = resolvePath(canonicalBase, request.path);
      let canonical: string;
      try {
        canonical = Deno.realPathSync(candidate);
      } catch (error) {
        if (!isFilesystemError(error)) throw error;
        const detail = error instanceof Deno.errors.NotFound
          ? "Macro library not found"
          : "Unable to resolve macro library";
        throw new TossSyntaxError(
          request.location,
          `${detail}: ${JSON.stringify(request.path)}.`,
        );
      }
      const existing = libraries.get(canonical);
      if (existing !== undefined) {
        imports.push({ location: request.location, definitions: [] });
        continue;
      }
      let librarySource: string;
      try {
        librarySource = Deno.readTextFileSync(canonical);
      } catch (error) {
        if (!isFilesystemError(error)) throw error;
        throw new TossSyntaxError(
          request.location,
          `Unable to read macro library ${JSON.stringify(request.path)}.`,
        );
      }
      const definitions = parseMacroLibrary(librarySource, canonical);
      libraries.set(canonical, definitions);
      imports.push({ location: request.location, definitions });
    }
    return imports;
  };

  return Object.freeze({
    baseDirectory: canonicalBase,
    copy,
    resolve: resolveImports,
  });
}

function isFilesystemError(error: unknown): boolean {
  return error instanceof Deno.errors.NotFound ||
    error instanceof Deno.errors.NotCapable ||
    error instanceof Deno.errors.PermissionDenied ||
    error instanceof Deno.errors.IsADirectory ||
    error instanceof Deno.errors.NotADirectory;
}
