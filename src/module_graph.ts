import type { Expression } from "./ast.ts";
import type { BundleModule } from "./codegen.ts";
import type { SourceLocation } from "./diagnostic.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import type { ModuleImport } from "./module_analysis.ts";

export type ResolvedModuleGraphNode = {
  readonly expressions: readonly Expression[];
  readonly imports: readonly ModuleImport[];
  readonly importIds: readonly number[];
};

export type ModuleGraphEdge = {
  readonly from: number;
  readonly to: number;
  readonly location: SourceLocation;
};

export function validateVirtualModulePath(
  path: string,
  location: SourceLocation,
): void {
  if (
    !(path.startsWith("./") || path.startsWith("../")) ||
    !hasTossExtension(path)
  ) {
    throw new TossSyntaxError(
      location,
      "%import path must be relative and end in .toss.",
    );
  }
}

/** Normalize one root-relative POSIX source ID, rejecting traversal above root. */
export function normalizeVirtualSourceId(path: string): string {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\")) {
    throw new TypeError(
      "Source IDs must be nonempty root-relative POSIX paths.",
    );
  }
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part.length === 0 || part === ".") continue;
    if (part === "..") {
      if (parts.pop() === undefined) {
        throw new TypeError("Source ID escapes the source map root.");
      }
      continue;
    }
    parts.push(part);
  }
  const id = parts.join("/");
  if (id.length === 0 || !id.endsWith(".toss")) {
    throw new TypeError("Source IDs must name .toss files.");
  }
  return id;
}

/** Resolve a relative Toss import to its canonical root-relative source ID. */
export function resolveVirtualSourceId(
  parentId: string,
  path: string,
  location: SourceLocation,
): string {
  validateVirtualModulePath(path, location);
  return resolveRelativeVirtualSourceId(parentId, path, location);
}

/** Resolve a macro-library path using its existing `.endsWith('.toss')` rule. */
export function resolveVirtualMacroSourceId(
  parentId: string,
  path: string,
  location: SourceLocation,
): string {
  if (
    !(path.startsWith("./") || path.startsWith("../")) ||
    !path.endsWith(".toss")
  ) {
    throw new TossSyntaxError(
      location,
      "%macroImport path must be relative and end in .toss.",
    );
  }
  return resolveRelativeVirtualSourceId(parentId, path, location);
}

function resolveRelativeVirtualSourceId(
  parentId: string,
  path: string,
  location: SourceLocation,
): string {
  if (path.includes("\\")) {
    throw new TossSyntaxError(
      location,
      "Virtual source imports must use POSIX forward slashes.",
    );
  }
  const parentParts = parentId.split("/");
  parentParts.pop();
  const parts = parentParts;
  for (const part of path.split("/")) {
    if (part.length === 0 || part === ".") continue;
    if (part === "..") {
      if (parts.pop() === undefined) {
        throw new TossSyntaxError(
          location,
          "Imported source path escapes the source map root.",
        );
      }
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

/** Validate static cycles and map resolved edges into the code generator shape. */
export function finalizeModuleGraph(
  modules: readonly ResolvedModuleGraphNode[],
  entry: number,
  edges: readonly ModuleGraphEdge[],
): BundleModule[] {
  checkCycles(entry, edges);
  return modules.map((module) => ({
    expressions: module.expressions,
    imports: module.imports.map((dependency, index) => {
      const id = module.importIds[index];
      if (id === undefined) {
        throw new TypeError("Resolved module id is missing.");
      }
      return { path: dependency.path, id };
    }),
  }));
}

function checkCycles(entry: number, edges: readonly ModuleGraphEdge[]): void {
  const visiting = new Set<number>();
  const visited = new Set<number>();
  function visit(id: number): void {
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of edges) {
      if (edge.from !== id) continue;
      if (visiting.has(edge.to)) {
        throw new TossSyntaxError(
          edge.location,
          "Static module dependency cycle detected.",
        );
      }
      visit(edge.to);
    }
    visiting.delete(id);
    visited.add(id);
  }
  visit(entry);
}

function hasTossExtension(path: string): boolean {
  const trimmed = path.replace(/\/+$/, "");
  const basename = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  const dot = basename.lastIndexOf(".");
  return dot > 0 && basename.slice(dot) === ".toss";
}
