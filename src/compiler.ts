import { generate } from "./codegen.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { analyzeModule } from "./module_analysis.ts";
import { compileFile } from "./module_loader.ts";
import { parse } from "./parser.ts";

export function compile(source: string, file: string): string {
  const expressions = parse(source, file);
  const analysis = analyzeModule(expressions, file, false);
  const unresolved = analysis.imports[0];
  if (unresolved !== undefined) {
    throw new TossSyntaxError(
      unresolved.location,
      "%import requires compileFile so its dependency can be resolved.",
    );
  }
  return generate(expressions);
}

export { compileFile };
