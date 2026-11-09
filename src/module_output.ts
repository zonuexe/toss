import { basename, dirname, resolve } from "node:path";
import { TossSyntaxError } from "./diagnostic.ts";

type ModuleOutputOptions = {
  readonly output?: string;
  readonly input: string;
  readonly moduleSources: readonly string[];
  readonly macroLibraries: ReadonlySet<string>;
  readonly runtimeImport?: string;
};

export async function validateModuleOutput(
  options: ModuleOutputOptions,
): Promise<void> {
  if (options.output === undefined) return;
  const canonicalOutput = await outputPath(options.output);
  const sources = [...options.moduleSources, ...options.macroLibraries];
  let overwritesSource = sources.includes(canonicalOutput);
  if (!overwritesSource) {
    let outputInfo: Deno.FileInfo | undefined;
    try {
      outputInfo = await Deno.stat(canonicalOutput);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    if (outputInfo !== undefined) {
      for (const source of sources) {
        const sourceInfo = await Deno.stat(source);
        if (outputInfo.ino === null || sourceInfo.ino === null) {
          throw new TossSyntaxError(
            { file: options.input, line: 1, column: 1 },
            "Cannot safely overwrite an existing output file without file identity information.",
          );
        }
        if (
          sourceInfo.ino === outputInfo.ino && sourceInfo.dev === outputInfo.dev
        ) {
          overwritesSource = true;
          break;
        }
      }
    }
  }
  if (overwritesSource) {
    throw new TossSyntaxError(
      { file: options.input, line: 1, column: 1 },
      "Output must not overwrite a module source file.",
    );
  }
  const runtimeImport = options.runtimeImport;
  if (
    runtimeImport !== undefined &&
    (runtimeImport.startsWith("./") || runtimeImport.startsWith("../")) &&
    !runtimeImport.includes("?") && !runtimeImport.includes("#") &&
    resolve(dirname(canonicalOutput), runtimeImport) === canonicalOutput
  ) {
    throw new TossSyntaxError(
      { file: options.input, line: 1, column: 1 },
      "Output must not import itself as its runtime module.",
    );
  }
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
