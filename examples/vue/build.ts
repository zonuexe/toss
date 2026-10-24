import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFile } from "../../src/compiler.ts";

const exampleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(exampleDirectory, "../..");
const assets = ["index.html", "app.js", "bridge.js"] as const;

export async function buildVueExample(
  outputDirectory = resolve(repositoryDirectory, "out/vue"),
): Promise<void> {
  await Deno.mkdir(outputDirectory, { recursive: true });
  const javascript = await compileFile(
    resolve(exampleDirectory, "counter.toss"),
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
