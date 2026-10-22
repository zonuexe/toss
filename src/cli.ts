import { dirname, resolve } from "node:path";
import { compileFile } from "./compiler.ts";
import { TossSyntaxError } from "./diagnostic.ts";

const usage = "Usage: deno task compile <source.toss> -o <output.js>";

class UsageError extends Error {
  override readonly name = "UsageError";
}

function parseArguments(args: readonly string[]): {
  readonly input: string;
  readonly output: string;
} {
  const [input, option, output, ...extra] = args;
  if (
    input === undefined || input.startsWith("-") || option !== "-o" ||
    output === undefined || output.startsWith("-") || extra.length > 0
  ) {
    throw new UsageError(usage);
  }
  if (resolve(input) === resolve(output)) {
    throw new UsageError("Input and output must be different files.");
  }
  return { input, output };
}

export async function main(args: readonly string[]): Promise<void> {
  try {
    if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
      console.log(usage);
      return;
    }
    const { input, output } = parseArguments(args);
    const javascript = await compileFile(input, output);
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
