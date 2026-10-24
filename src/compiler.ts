import { generate } from "./codegen.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { analyzeModule } from "./module_analysis.ts";
import { compileFile } from "./module_loader.ts";
import { expandProgram } from "./macro_compile.ts";
import { compileFormat, type CompileOptions } from "./compile_options.ts";

export type { CompileFormat, CompileOptions } from "./compile_options.ts";

export function compile(
  source: string,
  file: string,
  options: CompileOptions = {},
): string {
  const expressions = expandProgram(source, { file });
  const format = compileFormat(options);
  const analysis = analyzeModule(expressions, file, false);
  const unresolved = analysis.imports[0];
  if (unresolved !== undefined) {
    throw new TossSyntaxError(
      unresolved.location,
      "%import requires compileFile so its dependency can be resolved.",
    );
  }
  if (format === "esm" && analysis.exported === undefined) {
    throw new TossSyntaxError(
      expressions[0]?.location ?? { file, line: 1, column: 1 },
      "ES module output requires exactly one top-level %export.",
    );
  }
  return generate(expressions, { format });
}

export { compileFile };
