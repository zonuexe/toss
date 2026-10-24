import { compile } from "../src/compiler.ts";
import { generateFragment } from "../src/codegen.ts";
import {
  fileRootSetupLines,
  runtimePreludeLines,
} from "../src/codegen_prelude.ts";
import { expandProgram } from "../src/macro_compile.ts";

export async function execute(source: string): Promise<Deno.CommandOutput> {
  return await executeJavaScript(compile(source, "fixture.toss"));
}

export async function executeJavaScript(
  javascript: string,
  options: { readonly cachedOnly?: boolean } = {},
): Promise<Deno.CommandOutput> {
  const directory = await Deno.makeTempDir({ prefix: "toss-test-" });
  try {
    const output = `${directory}/program.js`;
    await Deno.writeTextFile(output, javascript);
    return await new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--no-config",
        "--no-prompt",
        ...(options.cachedOnly === true ? ["--cached-only"] : []),
        output,
      ],
      stdout: "piped",
      stderr: "piped",
    }).output();
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}

export async function executeFlatRuntime(
  source: string,
  appendedJavaScript: string,
  file = "fixture.toss",
): Promise<Deno.CommandOutput> {
  const expressions = expandProgram(source, { file });
  const javascript = [
    ...runtimePreludeLines(true),
    ...fileRootSetupLines(),
    `${generateFragment(expressions)};`,
    appendedJavaScript,
  ].join("\n");
  return await executeJavaScript(javascript);
}

export async function executeModuleJavaScript(
  javascript: string,
  consumer: string,
): Promise<Deno.CommandOutput> {
  const directory = await Deno.makeTempDir({ prefix: "toss-module-test-" });
  try {
    const modulePath = `${directory}/program.js`;
    const runnerPath = `${directory}/runner.js`;
    await Deno.writeTextFile(modulePath, javascript);
    await Deno.writeTextFile(
      runnerPath,
      `import value from "./program.js";\n${consumer}`,
    );
    return await new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-config", "--no-prompt", runnerPath],
      stdout: "piped",
      stderr: "piped",
    }).output();
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}

export async function executeModuleProbe(
  javascript: string,
  afterImport: string,
): Promise<Deno.CommandOutput> {
  const directory = await Deno.makeTempDir({ prefix: "toss-aot-probe-" });
  try {
    const modulePath = `${directory}/program.js`;
    const probePath = `${directory}/probe.js`;
    await Deno.writeTextFile(modulePath, javascript);
    await Deno.writeTextFile(
      probePath,
      [
        'Object.defineProperty(globalThis, "Function", {value() { throw new Error("Function blocked"); }});',
        'Object.defineProperty(globalThis, "eval", {value() { throw new Error("eval blocked"); }});',
        'const namespace = await import("./program.js");',
        afterImport,
      ].join("\n"),
    );
    return await new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-config", "--no-prompt", probePath],
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
