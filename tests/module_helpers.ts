import { compileFile } from "../src/compiler.ts";
import { text } from "./helpers.ts";

export async function runModuleProgram(
  files: Readonly<Record<string, string>>,
  entry: string,
  links: Readonly<Record<string, string>> = {},
): Promise<Deno.CommandOutput> {
  const directory = await Deno.makeTempDir({ prefix: "toss-modules-" });
  try {
    for (const [path, source] of Object.entries(files)) {
      const target = `${directory}/${path}`;
      await Deno.mkdir(target.slice(0, target.lastIndexOf("/")), {
        recursive: true,
      });
      await Deno.writeTextFile(target, source);
    }
    for (const [path, target] of Object.entries(links)) {
      await Deno.symlink(target, `${directory}/${path}`);
    }
    const javascript = await compileFile(`${directory}/${entry}`);
    const output = `${directory}/bundle.js`;
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

export async function runModuleBoundary(
  files: Readonly<Record<string, string>>,
  entry: string,
  boundary: string,
): Promise<Deno.CommandOutput> {
  const directory = await Deno.makeTempDir({ prefix: "toss-module-boundary-" });
  try {
    for (const [path, source] of Object.entries(files)) {
      const target = `${directory}/${path}`;
      await Deno.mkdir(target.slice(0, target.lastIndexOf("/")), {
        recursive: true,
      });
      await Deno.writeTextFile(target, source);
    }
    const javascript = await compileFile(`${directory}/${entry}`);
    const output = `${directory}/bundle.js`;
    await Deno.writeTextFile(output, javascript + boundary);
    return await new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-config", "--no-prompt", output],
      stdout: "piped",
      stderr: "piped",
    }).output();
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}

export function output(result: Deno.CommandOutput): string {
  return text(result.stdout);
}
