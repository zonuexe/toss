import { dirname, resolve } from "node:path";
import { compileFile } from "./compiler.ts";
import {
  compileRuntimeImport,
  compileTreeShakePrelude,
} from "./compile_options.ts";
import type { CompileFormat } from "./compile_options.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { version } from "./version.ts";

const usage =
  "Usage: deno task compile <source.toss> -o <output.js> [--format program|esm] [--runtime-import <specifier>] [--tree-shake-prelude]";

class UsageError extends Error {
  override readonly name = "UsageError";
}

function parseArguments(args: readonly string[]): {
  readonly input: string;
  readonly output: string;
  readonly format: CompileFormat;
  readonly treeShakePrelude: boolean;
  readonly runtimeImport?: string;
} {
  const input = args[0];
  if (input === undefined || input.startsWith("-")) {
    throw new UsageError(usage);
  }
  let output: string | undefined;
  let format: CompileFormat = "program";
  let formatSeen = false;
  let runtimeImport: string | undefined;
  let treeShakePrelude = false;
  let index = 1;
  while (index < args.length) {
    const option = args[index];
    const value = args[index + 1];
    if (
      option === "-o" && output === undefined && value !== undefined &&
      !value.startsWith("-")
    ) {
      output = value;
      index += 2;
      continue;
    }
    if (option === "--format" && !formatSeen && value !== undefined) {
      if (value !== "program" && value !== "esm") throw new UsageError(usage);
      format = value;
      formatSeen = true;
      index += 2;
      continue;
    }
    if (
      option === "--runtime-import" && runtimeImport === undefined &&
      value !== undefined && !value.startsWith("-")
    ) {
      runtimeImport = value;
      index += 2;
      continue;
    }
    if (option === "--tree-shake-prelude" && !treeShakePrelude) {
      treeShakePrelude = true;
      index++;
      continue;
    }
    throw new UsageError(usage);
  }
  if (output === undefined) throw new UsageError(usage);
  if (resolve(input) === resolve(output)) {
    throw new UsageError("Input and output must be different files.");
  }
  return {
    input,
    output,
    format,
    treeShakePrelude,
    ...(runtimeImport === undefined ? {} : { runtimeImport }),
  };
}

export async function main(args: readonly string[]): Promise<void> {
  try {
    if (args.length === 1 && args[0] === "--version") {
      console.log(`toss ${version}`);
      return;
    }
    if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
      console.log(usage);
      return;
    }
    const { input, output, format, runtimeImport, treeShakePrelude } =
      parseArguments(args);
    const options = {
      format,
      ...(runtimeImport === undefined ? {} : { runtimeImport }),
      ...(treeShakePrelude ? { treeShakePrelude } : {}),
    };
    try {
      compileRuntimeImport(options);
      compileTreeShakePrelude(options);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      throw new UsageError(error.message);
    }
    const javascript = await compileFile(input, output, options);
    await Deno.mkdir(dirname(output), { recursive: true });
    await Deno.writeTextFile(output, javascript);
  } catch (error) {
    if (
      error instanceof TossSyntaxError || error instanceof UsageError ||
      error instanceof Deno.errors.NotFound ||
      error instanceof Deno.errors.PermissionDenied ||
      error instanceof Deno.errors.NotCapable ||
      error instanceof Deno.errors.IsADirectory ||
      error instanceof Deno.errors.NotADirectory
    ) {
      console.error(error.message);
      Deno.exitCode = 1;
      return;
    }
    throw error;
  }
}

if (import.meta.main) await main(Deno.args);
