import { compile } from "../src/compiler.ts";

export async function execute(source: string): Promise<Deno.CommandOutput> {
  return await executeJavaScript(compile(source, "fixture.toss"));
}

export async function executeJavaScript(
  javascript: string,
): Promise<Deno.CommandOutput> {
  const directory = await Deno.makeTempDir({ prefix: "toss-test-" });
  try {
    const output = `${directory}/program.js`;
    await Deno.writeTextFile(output, javascript);
    return await new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-config", "--no-prompt", output],
      stdout: "piped",
      stderr: "piped",
    }).output();
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}

export function runCli(args: readonly string[]): Promise<Deno.CommandOutput> {
  return new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--no-prompt",
      "--allow-read",
      "--allow-write",
      "src/cli.ts",
      ...args,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
}

export function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
