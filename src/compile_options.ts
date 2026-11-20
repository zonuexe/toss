export type CompileFormat = "program" | "esm";

export type CompileOptions = {
  readonly format?: CompileFormat;
  readonly runtimeImport?: string;
  readonly failureObserverImport?: string;
  readonly treeShakePrelude?: boolean;
};

export function compileFormat(options: CompileOptions): CompileFormat {
  return options.format ?? "program";
}

export function compileTreeShakePrelude(options: CompileOptions): boolean {
  if (options.treeShakePrelude !== true) return false;
  if (options.runtimeImport !== undefined) {
    throw new TypeError(
      "Prelude tree-shaking requires an embedded runtime; remove --runtime-import.",
    );
  }
  return true;
}

export function compileRuntimeImport(
  options: CompileOptions,
): string | undefined {
  return moduleSpecifier(options.runtimeImport, "Runtime import");
}

export function compileFailureObserverImport(
  options: CompileOptions,
): string | undefined {
  return moduleSpecifier(
    options.failureObserverImport,
    "Failure observer import",
  );
}

function moduleSpecifier(
  specifier: string | undefined,
  label: string,
): string | undefined {
  if (specifier === undefined) return undefined;
  if (
    specifier.length === 0 || specifier.trim() !== specifier ||
    [...specifier].some((character) => {
      const code = character.codePointAt(0);
      return code !== undefined && (code < 32 || code === 127);
    })
  ) {
    throw new TypeError(label + " must be a nonempty module specifier.");
  }
  return specifier;
}
