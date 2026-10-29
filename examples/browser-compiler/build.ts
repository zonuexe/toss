import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exampleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(exampleDirectory, "../..");
const defaultOutputDirectory = resolve(
  repositoryDirectory,
  "out/browser-compiler",
);
const staticFiles = [
  "index.html",
  "app.js",
  "local_sources.js",
  "style.css",
] as const;

export async function buildBrowserCompilerExample(
  outputDirectory = defaultOutputDirectory,
): Promise<void> {
  await Deno.mkdir(outputDirectory, { recursive: true });
  const bundlePath = resolve(outputDirectory, "compiler.js");
  const bundle = await new Deno.Command(Deno.execPath(), {
    args: [
      "bundle",
      "--platform",
      "browser",
      "--format",
      "esm",
      "-o",
      bundlePath,
      resolve(repositoryDirectory, "src/source_compiler.ts"),
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (bundle.code !== 0) {
    throw new Error(new TextDecoder().decode(bundle.stderr));
  }
  await Promise.all(staticFiles.map((name) =>
    Deno.copyFile(
      resolve(exampleDirectory, name),
      resolve(outputDirectory, name),
    )
  ));
}

if (import.meta.main) await buildBrowserCompilerExample();
