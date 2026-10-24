import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFile } from "../../src/compiler.ts";

const exampleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(exampleDirectory, "../..");
const entryFiles = ["main", "strict", "aot", "blocked"] as const;
const staticFiles = [
  "index.html",
  "strict.html",
  "host.js",
  "strict-host.js",
] as const;

export async function buildBrowserExample(
  outputDirectory = resolve(repositoryDirectory, "out/browser"),
): Promise<void> {
  await Deno.mkdir(outputDirectory, { recursive: true });
  await Promise.all(entryFiles.map(async (name) => {
    const javascript = await compileFile(
      resolve(exampleDirectory, `${name}.toss`),
    );
    await Deno.writeTextFile(
      resolve(outputDirectory, `${name}.js`),
      javascript,
    );
  }));
  await Promise.all(staticFiles.map((name) =>
    Deno.copyFile(
      resolve(exampleDirectory, name),
      resolve(outputDirectory, name),
    )
  ));
}

if (import.meta.main) await buildBrowserExample();
