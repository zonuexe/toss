import { dirname, resolve } from "node:path";
import { generateRuntimeModule } from "./runtime_module.ts";
import { version } from "./version.ts";

const usage = "Usage: deno task runtime -o <runtime.js>";

class UsageError extends Error {
  override readonly name = "UsageError";
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
    if (
      args.length !== 2 || args[0] !== "-o" || args[1] === undefined ||
      args[1].startsWith("-")
    ) throw new UsageError(usage);
    const path = resolve(args[1]);
    await Deno.mkdir(dirname(path), { recursive: true });
    await Deno.writeTextFile(path, generateRuntimeModule());
  } catch (error) {
    if (
      error instanceof UsageError || error instanceof Deno.errors.NotFound ||
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
