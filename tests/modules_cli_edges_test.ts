import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { runCli, text } from "./helpers.ts";

async function project(
  files: Readonly<Record<string, string>>,
  action: (directory: string, input: string, output: string) => Promise<void>,
): Promise<void> {
  const directory = await Deno.makeTempDir({ prefix: "toss-modules-cli-" });
  try {
    for (const [name, source] of Object.entries(files)) {
      const file = join(directory, "source", name);
      await Deno.mkdir(dirname(file), { recursive: true });
      await Deno.writeTextFile(file, source);
    }
    await action(
      directory,
      join(directory, "source/main.toss"),
      join(directory, "bundle.js"),
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}

function run(output: string, cwd: string): Promise<Deno.CommandOutput> {
  return new Deno.Command(Deno.execPath(), {
    args: ["run", "--no-config", "--no-prompt", output],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
}

Deno.test("module CLI bundle works without its source files and shares canonical imports", async () => {
  await project({
    "main.toss":
      "#a bind: %import('./lib.toss'). #b bind: %import('./nested/../lib.toss'). $a at: 'state' put: 42. $b state print.",
    "lib.toss": "'init' print. %export($Object clone).",
    "nested/marker.toss": "%export(0).",
  }, async (directory, input, output) => {
    const compiled = await runCli([input, "-o", output]);
    assert.equal(compiled.code, 0, text(compiled.stderr));
    assert.equal(text(compiled.stdout), "");
    await Deno.remove(join(directory, "source"), { recursive: true });
    const result = await run(output, directory);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "init\n42\n");
  });
});

Deno.test("module CLI import initializes lazily once and finishes post-export statements", async () => {
  await project({
    "main.toss":
      "'before' print. #load bind: { %import('./lib.toss') }. 'ready' print. $load value print. $load value print. 'after' print.",
    "lib.toss": "'init' print. %export(7). 'tail' print.",
  }, async (directory, input, output) => {
    const compiled = await runCli([input, "-o", output]);
    assert.equal(compiled.code, 0, text(compiled.stderr));
    const result = await run(output, directory);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(
      text(result.stdout),
      "before\nready\ninit\ntail\n7\n7\nafter\n",
    );
  });
});

Deno.test("module CLI isolates roots and private bindings while sharing named Symbol identity", async () => {
  await project({
    "main.toss":
      "$Object at: 'tag' put: 'entry'. #private bind: 1. #lib bind: %import('./lib.toss'). $lib root tag print. $Object tag print. $lib read print. $lib make dump. $Symbol generateUnique dump. ($lib named equals: #shared) print.",
    "lib.toss":
      "$Object at: 'tag' put: 'library'. $Symbol at: 'generateUnique' put: { #library }. #private bind: 99. %export($Object clone |> %extend(root: $Object, read: { $private }, make: { $Symbol generateUnique }, named: #shared)).",
  }, async (directory, input, output) => {
    const compiled = await runCli([input, "-o", output]);
    assert.equal(compiled.code, 0, text(compiled.stderr));
    const result = await run(output, directory);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(
      text(result.stdout),
      "library\nentry\n99\n#library\n#<unique>\ntrue\n",
    );
  });
});

Deno.test("module CLI validates missing imports in unused Blocks and preserves old output", async () => {
  await project({
    "main.toss": "#unused bind: { %import('./missing.toss') }. 'never' print.",
  }, async (_directory, input, output) => {
    await Deno.writeTextFile(output, "existing output");
    const result = await runCli([input, "-o", output]);
    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "");
    assert.match(text(result.stderr), /main\.toss:1:17:/);
    assert.equal(await Deno.readTextFile(output), "existing output");
  });
});

Deno.test("module initialization cannot inherit the importing method's parent context", async () => {
  await project({
    "main.toss":
      "#a bind: ($Object clone |> %extend(m: { 'wrong' print })). #b bind: ($a clone |> %extend(m: { %import('./lib.toss') })). $b m.",
    "lib.toss": "%export($Nil). %super().",
  }, async (directory, input, output) => {
    const compiled = await runCli([input, "-o", output]);
    assert.equal(compiled.code, 0, text(compiled.stderr));
    const result = await run(output, directory);
    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "");
    assert.match(text(result.stderr), /lib\.toss:1:16: RuntimeError:/);
    assert.match(
      text(result.stderr),
      /%super requires a method invocation context/,
    );
  });
});

Deno.test("module CLI refuses to overwrite a dependency source", async () => {
  const source = "%export(7).";
  await project({
    "main.toss": "%import('./lib.toss') print.",
    "lib.toss": source,
  }, async (directory, input) => {
    const dependency = join(directory, "source/lib.toss");
    const result = await runCli([input, "-o", dependency]);
    assert.notEqual(result.code, 0);
    assert.equal(await Deno.readTextFile(dependency), source);
  });
});

Deno.test("module CLI refuses output aliases of dependency sources", async () => {
  const source = "%export(7).";
  await project({
    "main.toss": "%import('./lib.toss') print.",
    "lib.toss": source,
  }, async (directory, input) => {
    const dependency = join(directory, "source/lib.toss");
    const alias = join(directory, "alias.js");
    await Deno.symlink(dependency, alias);
    const result = await runCli([input, "-o", alias]);
    assert.notEqual(result.code, 0);
    assert.equal(await Deno.readTextFile(dependency), source);
  });
});

Deno.test("module CLI shares initialization across symlink aliases", async () => {
  await project({
    "main.toss":
      "#a bind: %import('./lib.toss'). #b bind: %import('./alias.toss'). $a at: 'value' put: 9. $b value print.",
    "lib.toss": "'once' print. %export($Object clone).",
  }, async (directory, input, output) => {
    await Deno.symlink(
      join(directory, "source/lib.toss"),
      join(directory, "source/alias.toss"),
    );
    const compiled = await runCli([input, "-o", output]);
    assert.equal(compiled.code, 0, text(compiled.stderr));
    const result = await run(output, directory);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "once\n9\n");
  });
});

Deno.test("module import can be an explicit argument before a pipeline's injected value", async () => {
  await project({
    "main.toss":
      "('piped' |> { first,second -> [$first,$second] } value: %import('./value.toss') value:) dump.",
    "value.toss": "%export(7).",
  }, async (directory, input, output) => {
    const compiled = await runCli([input, "-o", output]);
    assert.equal(compiled.code, 0, text(compiled.stderr));
    const result = await run(output, directory);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), '[7, "piped"]\n');
  });
});
