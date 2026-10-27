import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFile, generateRuntimeModule } from "../../src/compiler.ts";

const exampleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(exampleDirectory, "../..");
const assets = ["index.html", "app.js"] as const;

export async function buildVueExample(
  outputDirectory = resolve(repositoryDirectory, "out/vue"),
): Promise<void> {
  await Deno.mkdir(outputDirectory, { recursive: true });
  await Deno.writeTextFile(
    resolve(outputDirectory, "runtime.js"),
    generateRuntimeModule(),
  );
  const javascript = await compileFile(
    resolve(exampleDirectory, "counter.toss"),
    undefined,
    { format: "esm", runtimeImport: "./runtime.js" },
  );
  await Deno.writeTextFile(resolve(outputDirectory, "counter.js"), javascript);
  await Promise.all(assets.map((name) =>
    Deno.copyFile(
      resolve(exampleDirectory, name),
      resolve(outputDirectory, name),
    )
  ));
}

if (import.meta.main) await buildVueExample();
