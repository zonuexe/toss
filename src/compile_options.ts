export type CompileFormat = "program" | "esm";

export type CompileOptions = {
  readonly format?: CompileFormat;
  readonly runtimeImport?: string;
};

export function compileFormat(options: CompileOptions): CompileFormat {
  return options.format ?? "program";
}

export function compileRuntimeImport(
  options: CompileOptions,
): string | undefined {
  const specifier = options.runtimeImport;
  if (specifier === undefined) return undefined;
  if (
    specifier.length === 0 || specifier.trim() !== specifier ||
    [...specifier].some((character) => {
      const code = character.codePointAt(0);
      return code !== undefined && (code < 32 || code === 127);
    })
  ) {
    throw new TypeError("Runtime import must be a nonempty module specifier.");
  }
  return specifier;
}
