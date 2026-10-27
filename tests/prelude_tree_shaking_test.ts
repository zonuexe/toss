import assert from "node:assert/strict";
import { join } from "node:path";
import { compile, compileFile } from "../src/compiler.ts";
import {
  executeJavaScript,
  executeModuleJavaScript,
  runCli,
  text,
} from "./helpers.ts";

async function compareSuccessfulOutput(
  source: string,
  expectedOutput: string,
): Promise<void> {
  const full = await executeJavaScript(compile(source, "fixture.toss"));
  const optimized = await executeJavaScript(
    compile(source, "fixture.toss", { treeShakePrelude: true }),
  );
  assert.equal(full.code, 0, text(full.stderr));
  assert.equal(text(full.stdout), expectedOutput);
  assert.equal(text(full.stderr), "");
  assert.equal(optimized.code, full.code);
  assert.equal(text(optimized.stdout), expectedOutput);
  assert.equal(text(optimized.stderr), "");
}

async function compareFailure(
  source: string,
  expectedMessage: RegExp,
): Promise<void> {
  const full = await executeJavaScript(compile(source, "fixture.toss"));
  const optimized = await executeJavaScript(
    compile(source, "fixture.toss", { treeShakePrelude: true }),
  );
  assert.notEqual(full.code, 0);
  assert.match(text(full.stderr), expectedMessage);
  assert.equal(optimized.code, full.code);
  assert.equal(text(optimized.stdout), text(full.stdout));
  assert.equal(text(optimized.stderr), text(full.stderr));
}

Deno.test("tree-shaken prelude preserves nested inspection and generated extension sends", async () => {
  await compareSuccessfulOutput(
    "[1, 'nested'] print. [1, [2]] dump.",
    '[1, "nested"]\n[1, [2]]\n',
  );
  await compareSuccessfulOutput(
    "#object bind: ($Object clone |> %extend(answer: 42)). $object answer print.",
    "42\n",
  );
  await compareSuccessfulOutput(
    "%macro(#answer, { syntax -> %quote(41 add: 1) }). %answer() print.",
    "42\n",
  );
  await compareSuccessfulOutput(
    "%macro(#dynamic, { syntax -> %quote($object perform: 'answer') }). #object bind: ($Object clone |> %extend(answer: { 42 })). %dynamic() print.",
    "42\n",
  );
  await compareSuccessfulOutput(
    "#unused bind: { 2 add: 40 }. 42 print.",
    "42\n",
  );
  await compareFailure("1 unknownMessage.", /Unknown message "unknownMessage"/);
});

Deno.test("JavaScript expressions and imports conservatively retain the full prelude", async () => {
  const cases = [
    "#unused bind: { %js(0) }. 'hello' print.",
    "#unused bind: { %jsImport('node:path') }. 'hello' print.",
    "#unused bind: { %js(value = 0; value) }. 'hello' print.",
  ];
  for (const source of cases) {
    assert.equal(
      compile(source, "fixture.toss", { treeShakePrelude: true }),
      compile(source, "fixture.toss"),
    );
  }
  await compareSuccessfulOutput(
    "%js(Map.prototype.get = new Proxy(Map.prototype.get, { apply(target, receiver, args) { if (args[0] === 'print') args[0] = 'dump'; return Reflect.apply(target, receiver, args); } })). 'hello' print.",
    '"hello"\n',
  );

  const mutationSource =
    "const original = Map.prototype.get; Map.prototype.get = function(key) { return original.call(this, key === 'print' ? 'dump' : key); };";
  const encodedMutation = encodeURIComponent(mutationSource).replaceAll(
    ",",
    "%2C",
  ).replaceAll("'", "%27").replaceAll("(", "%28").replaceAll(")", "%29");
  const specifier = `data:text/javascript,${encodedMutation}`;
  const source = `%jsImport('${specifier}') dump. 'hello' print.`;
  const full = compile(source, "fixture.toss");
  const optimized = compile(source, "fixture.toss", {
    treeShakePrelude: true,
  });
  assert.equal(optimized, full);
  const result = await executeJavaScript(optimized);
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), '<js>\n"hello"\n');

  const directory = await Deno.makeTempDir({
    prefix: "toss-prelude-js-module-",
  });
  try {
    await Deno.writeTextFile(
      join(directory, "dependency.toss"),
      `%jsImport('${specifier}') dump. %export(0).`,
    );
    await Deno.writeTextFile(
      join(directory, "entry.toss"),
      "#unused bind: %import('./dependency.toss'). 'hello' print.",
    );
    const fullBundle = await compileFile(join(directory, "entry.toss"));
    const optimizedBundle = await compileFile(
      join(directory, "entry.toss"),
      undefined,
      { treeShakePrelude: true },
    );
    assert.equal(optimizedBundle, fullBundle);
    const bundleResult = await executeJavaScript(optimizedBundle);
    assert.equal(bundleResult.code, 0, text(bundleResult.stderr));
    assert.equal(text(bundleResult.stdout), '<js>\n"hello"\n');
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("tree-shaken prelude includes module and exported callback selectors", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-prelude-modules-" });
  try {
    await Deno.writeTextFile(
      join(directory, "dependency.toss"),
      "%export(40 add: 2).",
    );
    await Deno.writeTextFile(
      join(directory, "entry.toss"),
      "#unused bind: %import('./dependency.toss'). 'entry' print.",
    );
    const bundle = await compileFile(
      join(directory, "entry.toss"),
      undefined,
      { treeShakePrelude: true },
    );
    const result = await executeJavaScript(bundle);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "entry\n");

    const callback = compile(
      "#increment bind: { value -> $value add: 1 } asJSCallback. %export($increment).",
      "callback.toss",
      { format: "esm", treeShakePrelude: true },
    );
    const exported = await executeModuleJavaScript(
      callback,
      "console.log(value(41));",
    );
    assert.equal(exported.code, 0, text(exported.stderr));
    assert.equal(text(exported.stdout), "42\n");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("dynamic perform and parent sends fall back to the full prelude", async () => {
  for (
    const source of [
      "#object bind: ($Object clone |> %extend(answer: { 42 })). ($object perform: 'answer') print.",
      "#object bind: ($Object clone |> %extend(sum: { left, right -> $left add: $right })). ($object perform: 'sum' withArguments: [20, 22]) print.",
      "#parent bind: ($Object clone |> %extend(m: { 40 })). #child bind: ($parent clone |> %extend(m: { (%super()) add: 2 })). $child m print.",
    ]
  ) {
    const full = compile(source, "fixture.toss");
    const optimized = compile(source, "fixture.toss", {
      treeShakePrelude: true,
    });
    assert.equal(optimized, full);
    await compareSuccessfulOutput(source, "42\n");
  }
});

Deno.test("tree-shaken output is smaller and rejects shared runtimes", async () => {
  const source = "'hello' print.";
  const full = compile(source, "size.toss");
  const optimized = compile(source, "size.toss", { treeShakePrelude: true });
  assert.ok(full.length - optimized.length > 7000);

  assert.throws(
    () =>
      compile(source, "external.toss", {
        treeShakePrelude: true,
        runtimeImport: "./runtime.js",
      }),
    /requires an embedded runtime/,
  );

  const directory = await Deno.makeTempDir({ prefix: "toss-prelude-cli-" });
  try {
    const input = join(directory, "input.toss");
    const output = join(directory, "output.js");
    await Deno.writeTextFile(input, source);
    const expected = await compileFile(input, undefined, {
      treeShakePrelude: true,
    });
    const result = await runCli([
      input,
      "-o",
      output,
      "--tree-shake-prelude",
    ]);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(
      await Deno.readTextFile(output),
      expected,
    );
    const incompatible = await runCli([
      input,
      "-o",
      output,
      "--runtime-import",
      "./runtime.js",
      "--tree-shake-prelude",
    ]);
    assert.notEqual(incompatible.code, 0);
    assert.match(text(incompatible.stderr), /requires an embedded runtime/);
    assert.equal(
      await Deno.readTextFile(output),
      expected,
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
