export type CompileFormat = "program" | "esm";

export type CompileOptions = {
  readonly format?: CompileFormat;
};

export function compileFormat(options: CompileOptions): CompileFormat {
  return options.format ?? "program";
}
