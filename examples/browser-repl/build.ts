import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exampleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(exampleDirectory, "../..");
const defaultOutputDirectory = resolve(repositoryDirectory, "out/browser-repl");
const staticFiles = [
  "index.html",
  "app.js",
  "worker.js",
  "worker-client.js",
  "source-list.js",
  "style.css",
  "demo-module.js",
] as const;

export async function buildBrowserReplExample(
  outputDirectory = defaultOutputDirectory,
): Promise<void> {
  await Deno.mkdir(outputDirectory, { recursive: true });
  const bundlePath = resolve(outputDirectory, "repl-core.js");
  const result = await new Deno.Command(Deno.execPath(), {
    args: [
      "bundle",
      "--platform",
      "browser",
      "--format",
      "esm",
      resolve(repositoryDirectory, "src/repl_core.ts"),
      "-o",
      bundlePath,
    ],
    cwd: repositoryDirectory,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (result.code !== 0) {
    throw new Error(
      `Unable to bundle browser REPL core: ${
        new TextDecoder().decode(result.stderr)
      }`,
    );
  }
  await Promise.all(staticFiles.map((name) =>
    Deno.copyFile(
      resolve(exampleDirectory, name),
      resolve(outputDirectory, name),
    )
  ));
}

if (import.meta.main) await buildBrowserReplExample();
