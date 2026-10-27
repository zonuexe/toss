import assert from "node:assert/strict";
import {
  compileFile,
  compileSources as compileSourcesFacade,
} from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { compileSources } from "../src/source_compiler.ts";
import { executeJavaScript, executeModuleProbe, text } from "./helpers.ts";

function sourceMap(
  entries: readonly (readonly [string, string])[],
): Map<string, string> {
  return new Map(entries);
}

Deno.test("virtual Toss imports normalize aliases and initialize shared modules once", async () => {
  const sources = sourceMap([
    [
      "main.toss",
      "#left bind: %import('./lib/value.toss'). #right bind: %import('./lib/../lib/value.toss'). $left at: 'value' put: 7. ($right at: 'value') print.",
    ],
    ["lib/value.toss", "'loaded' print. %export($Object clone)."],
  ]);
  const javascript = compileSources("main.toss", sources);
  assert.equal(compileSourcesFacade("main.toss", sources), javascript);
  const result = await executeJavaScript(javascript);
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "loaded\n7\n");
});

Deno.test("virtual macro libraries keep consumer scope and source order", async () => {
  const sources = sourceMap([
    [
      "app/main.toss",
      "#offset bind: 30. %macroImport('./macros.toss'). %macroImport('./sub/../macros.toss'). (%offsetBy(1)) print.",
    ],
    [
      "app/macros.toss",
      "%macro(#offsetBy, { n -> %`((%,($n)) add: $offset) }).",
    ],
  ]);
  const result = await executeJavaScript(
    compileSources("app/main.toss", sources),
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "31\n");
});

Deno.test("virtual and filesystem module loaders produce equivalent results", async () => {
  const files = {
    "main.toss":
      "%macroImport('./lib/macros.toss'). #value bind: %import('./lib/value.toss'). %answer() print. $value print.",
    "lib/macros.toss": "%macro(#answer, { s -> %quote(42) }).",
    "lib/value.toss": "%export(7).",
  };
  const virtual = await executeJavaScript(
    compileSources("main.toss", new Map(Object.entries(files))),
  );
  const directory = await Deno.makeTempDir({ prefix: "toss-virtual-parity-" });
  try {
    await Deno.mkdir(`${directory}/lib`);
    for (const [path, source] of Object.entries(files)) {
      await Deno.writeTextFile(`${directory}/${path}`, source);
    }
    const filesystem = await executeJavaScript(
      await compileFile(`${directory}/main.toss`),
    );
    assert.equal(virtual.code, 0, text(virtual.stderr));
    assert.equal(filesystem.code, 0, text(filesystem.stderr));
    assert.equal(text(virtual.stdout), "42\n7\n");
    assert.equal(text(filesystem.stdout), text(virtual.stdout));
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("virtual source modules preserve lazy initialization and failure caching", async () => {
  const lazy = compileSources(
    "main.toss",
    sourceMap([
      ["main.toss", "{ %import('./lazy.toss') }. 42 print."],
      ["lazy.toss", "'unexpected' print. %export(1)."],
    ]),
  );
  const lazyResult = await executeJavaScript(lazy);
  assert.equal(lazyResult.code, 0, text(lazyResult.stderr));
  assert.equal(text(lazyResult.stdout), "42\n");

  const esm = compileSources(
    "main.toss",
    sourceMap([
      [
        "main.toss",
        "#entry bind: { %import('./failure.toss') } asJSCallback. %export($entry).",
      ],
      ["failure.toss", "'once' print. %export(1). $unbound."],
    ]),
    { format: "esm" },
  );
  const cached = await executeModuleProbe(
    esm,
    [
      "let first; let second;",
      "try { namespace.default(); } catch (error) { first = error; }",
      "try { namespace.default(); } catch (error) { second = error; }",
      "console.log(first === second);",
    ].join("\n"),
  );
  assert.equal(cached.code, 0, text(cached.stderr));
  assert.equal(text(cached.stdout), "once\ntrue\n");
});

Deno.test("virtual modules reject cycles at the closing import location", () => {
  assert.throws(
    () =>
      compileSources(
        "main.toss",
        sourceMap([
          ["main.toss", "%import('./nested/first.toss')."],
          ["nested/first.toss", "%import('../main.toss'). %export(1)."],
        ]),
      ),
    (error: unknown) => {
      assert.ok(error instanceof TossSyntaxError);
      assert.equal(error.location.file, "nested/first.toss");
      assert.equal(error.location.line, 1);
      assert.match(error.message, /Static module dependency cycle/);
      return true;
    },
  );
});

Deno.test("virtual source maps reject missing, escaping, invalid, and duplicate IDs", () => {
  assert.throws(
    () => compileSources("missing.toss", new Map()),
    /Entry source is not present/,
  );
  assert.throws(
    () => compileSources("../main.toss", new Map()),
    /escapes the source map root/,
  );
  assert.throws(
    () => compileSources("/main.toss", new Map()),
    /root-relative POSIX/,
  );
  assert.throws(() =>
    compileSources(
      "main.toss",
      sourceMap([
        ["main.toss", "42."],
        ["folder/../main.toss", "43."],
      ]),
    ), /Duplicate source map path/);

  for (
    const source of [
      "%import('../outside.toss').",
      "%import('./missing.toss').",
      "%import('./missing.toss/').",
    ]
  ) {
    assert.throws(
      () =>
        compileSources(
          "nested/main.toss",
          sourceMap([
            ["nested/main.toss", source],
          ]),
        ),
      (error: unknown) => {
        assert.ok(error instanceof TossSyntaxError);
        assert.equal(error.location.file, "nested/main.toss");
        assert.match(
          error.message,
          /escapes the source map root|Imported file not found|relative and end in \.toss/,
        );
        return true;
      },
    );
  }

  for (
    const directive of [
      "%macroImport('../../outside.toss').",
      "%macroImport('./missing.toss').",
    ]
  ) {
    assert.throws(
      () =>
        compileSources(
          "nested/main.toss",
          sourceMap([[
            "nested/main.toss",
            directive,
          ]]),
        ),
      (error: unknown) => {
        assert.ok(error instanceof TossSyntaxError);
        assert.equal(error.location.file, "nested/main.toss");
        assert.match(
          error.message,
          /escapes the source map root|Macro library not found/,
        );
        return true;
      },
    );
  }
});

Deno.test("virtual compiler preserves runtime paths, macros, and ESM options", async () => {
  const sources = sourceMap([
    [
      "main.toss",
      "%macroImport('./macros.toss'). #path bind: %jsImport('node:path'). %export(%js(p = $path; p.basename('/a/b'))).",
    ],
    ["macros.toss", "%macro(#unused, { s -> $s })."],
  ]);
  const javascript = compileSources("main.toss", sources, {
    format: "esm",
    treeShakePrelude: true,
  });
  assert.match(javascript, /from "node:path"/);
  const result = await executeModuleProbe(
    javascript,
    "console.log(namespace.default);",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "b\n");
});

Deno.test("virtual path resolution preserves extension and literal punctuation rules", async () => {
  const punctuation = await executeJavaScript(
    compileSources(
      "main.toss",
      sourceMap([
        ["main.toss", "%import('./lib#part?.toss') print."],
        ["lib#part?.toss", "%export(7)."],
      ]),
    ),
  );
  assert.equal(punctuation.code, 0, text(punctuation.stderr));
  assert.equal(text(punctuation.stdout), "7\n");

  const trailingSlash = await executeJavaScript(
    compileSources(
      "main.toss",
      sourceMap([
        ["main.toss", "%import('./dir/file.toss/') print."],
        ["dir/file.toss", "%export(7)."],
      ]),
    ),
  );
  assert.equal(trailingSlash.code, 0, text(trailingSlash.stderr));
  assert.equal(text(trailingSlash.stdout), "7\n");
});

Deno.test("virtual macro imports retain the hidden .toss filename rule", async () => {
  const main = "%macroImport('./.toss'). %fromHidden() print.";
  const library = "%macro(#fromHidden, { s -> %quote(42) }).";
  const virtual = await executeJavaScript(
    compileSources(
      "main.toss",
      sourceMap([
        ["main.toss", main],
        [".toss", library],
      ]),
    ),
  );
  assert.equal(virtual.code, 0, text(virtual.stderr));
  assert.equal(text(virtual.stdout), "42\n");

  const directory = await Deno.makeTempDir({ prefix: "toss-dot-toss-" });
  try {
    await Deno.writeTextFile(`${directory}/main.toss`, main);
    await Deno.writeTextFile(`${directory}/.toss`, library);
    const filesystem = await executeJavaScript(
      await compileFile(`${directory}/main.toss`),
    );
    assert.equal(filesystem.code, 0, text(filesystem.stderr));
    assert.equal(text(filesystem.stdout), text(virtual.stdout));
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("virtual compilation neither executes nor resolves JavaScript imports", () => {
  Reflect.set(globalThis, "sourceCompilerImportCount", 0);
  const specifier = `data:text/javascript,${
    encodeURIComponent(
      "globalThis.sourceCompilerImportCount += 1; export const value = 5;",
    )
  }`;
  try {
    const javascript = compileSources(
      "main.toss",
      sourceMap([
        ["main.toss", `%jsImport('${specifier}'). %export(1).`],
      ]),
      { format: "esm" },
    );
    assert.equal(Reflect.get(globalThis, "sourceCompilerImportCount"), 0);
    assert.ok(javascript.includes(specifier));
  } finally {
    Reflect.deleteProperty(globalThis, "sourceCompilerImportCount");
  }
});

Deno.test("filesystem module loader retains node:path extname behavior for trailing slash", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "toss-source-path-parity-",
  });
  try {
    await Deno.writeTextFile(
      `${directory}/main.toss`,
      "%import('./value.toss/') print.",
    );
    await Deno.writeTextFile(`${directory}/value.toss`, "%export(7).");
    const result = await executeJavaScript(
      await compileFile(`${directory}/main.toss`),
    );
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "7\n");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
