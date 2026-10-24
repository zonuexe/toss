import assert from "node:assert/strict";
import { join } from "node:path";
import { createAsyncReplSession, createReplSession } from "../src/repl.ts";

type Fixture = {
  readonly baseDirectory: string;
  readonly [Symbol.dispose]: () => void;
};

function fixture(
  files: Readonly<Record<string, string>>,
  aliases: Readonly<Record<string, string>> = {},
): Fixture {
  const directory = Deno.makeTempDirSync();
  for (const [name, source] of Object.entries(files)) {
    const path = join(directory, name);
    Deno.mkdirSync(join(path, ".."), { recursive: true });
    Deno.writeTextFileSync(path, source);
  }
  for (const [name, target] of Object.entries(aliases)) {
    Deno.symlinkSync(target, join(directory, name));
  }
  return {
    baseDirectory: directory,
    [Symbol.dispose]: () => Deno.removeSync(directory, { recursive: true }),
  };
}

Deno.test("REPL import initializes a module once and shares its export", () => {
  using temp = fixture({
    "counter.toss": "'loaded' print. %export($Object clone).",
  });
  const { baseDirectory } = temp;
  const session = createReplSession({ baseDirectory });
  const first = session.submit("#first bind: %import('./counter.toss').");
  const second = session.submit("#second bind: %import('./counter.toss').");
  assert.equal(first.kind, "value");
  assert.equal(second.kind, "value");
  session.submit("$first at: 'marker' put: 8.");
  assert.deepEqual(session.submit("$second at: 'marker'."), {
    kind: "value",
    display: "8",
  });
});

Deno.test("REPL import validates missing dependencies before cell effects", () => {
  using temp = fixture({ "entry.toss": "%export(1)." });
  const { baseDirectory } = temp;
  const session = createReplSession({ baseDirectory });
  const failed = session.submit(
    "#before bind: 'no'. { %import('./missing.toss') }.",
  );
  assert.equal(failed.kind, "error");
  assert.equal(session.submit("$before.").kind, "error");
});

Deno.test("REPL eagerly loads JS imports in unexecuted module branches", async () => {
  using temp = fixture({
    "host.toss": "{ %jsImport('npm:example') }. %export(1).",
  });
  const { baseDirectory } = temp;
  const loaded: string[] = [];
  const session = createAsyncReplSession({
    baseDirectory,
    loadJavaScriptModule: (specifier) => {
      loaded.push(specifier);
      return Promise.resolve({});
    },
  });
  assert.deepEqual(await session.submit("%import('./host.toss')."), {
    kind: "value",
    display: "1",
  });
  assert.deepEqual(loaded, ["npm:example"]);
});

Deno.test("nested module imports resolve from each file directory", () => {
  using temp = fixture({
    "main.toss": "%export(%import('./sub/value.toss')).",
    "sub/value.toss": "%export(%import('../number.toss')).",
    "number.toss": "%export(34).",
  });
  const { baseDirectory } = temp;
  const session = createReplSession({ baseDirectory });
  assert.deepEqual(session.submit("%import('./main.toss')."), {
    kind: "value",
    display: "34",
  });
});

Deno.test("diamond dependencies share the same exported Object", () => {
  using temp = fixture({
    "leaf.toss": "%export($Object clone).",
    "left.toss": "%export(%import('./leaf.toss')).",
    "right.toss": "%export(%import('./leaf.toss')).",
  });
  const { baseDirectory } = temp;
  const session = createReplSession({ baseDirectory });
  session.submit("#left bind: %import('./left.toss').");
  session.submit("#right bind: %import('./right.toss').");
  session.submit("$left at: 'same' put: 13.");
  assert.deepEqual(session.submit("$right at: 'same'."), {
    kind: "value",
    display: "13",
  });
});

Deno.test("module roots stay private and exported Blocks retain their root", () => {
  using temp = fixture({
    "private.toss": "#secret bind: 4. %export({ $secret }).",
  });
  const { baseDirectory } = temp;
  const session = createReplSession({ baseDirectory });
  session.submit("#secret bind: 99.");
  session.submit("#reader bind: %import('./private.toss').");
  assert.deepEqual(session.submit("$reader value."), {
    kind: "value",
    display: "4",
  });
});

Deno.test("module graph rejects cycles and invalid export shapes before effects", () => {
  using temp = fixture({
    "a.toss": "%import('./b.toss'). %export(1).",
    "b.toss": "%import('./a.toss'). %export(2).",
    "empty.toss": "1.",
    "many.toss": "%export(1). %export(2).",
    "nested.toss": "%export({ %export(1) }).",
  });
  const { baseDirectory } = temp;
  const session = createReplSession({ baseDirectory });
  const cases = [
    ["a", /Static module dependency cycle detected/],
    ["empty", /exactly one top-level %export/],
    ["many", /only one %export/],
    ["nested", /only valid as a standalone top-level statement/],
  ] as const;
  for (const [name, diagnostic] of cases) {
    const result = session.submit(
      `'side effect' print. %import('./${name}.toss').`,
    );
    assert.equal(result.kind, "error");
    if (result.kind === "error") assert.match(result.message, diagnostic);
  }
});

Deno.test("session macros do not enter imported module compilation", () => {
  using temp = fixture({ "uses.toss": "%export(%answer())." });
  const { baseDirectory } = temp;
  const session = createReplSession({ baseDirectory });
  session.submit("%macro(#answer, { syntax -> %quote(1) }).");
  assert.equal(session.submit("%import('./uses.toss').").kind, "error");
});

Deno.test("one cell snapshots import IDs for Blocks across alias changes", () => {
  using temp = fixture({
    "one.toss": "%export(11).",
    "two.toss": "%export(22).",
  }, { "alias.toss": "one.toss" });
  const { baseDirectory } = temp;
  const session = createReplSession({ baseDirectory });
  session.submit("#saved bind: { %import('./alias.toss') }.");
  Deno.removeSync(join(baseDirectory, "alias.toss"));
  Deno.symlinkSync("two.toss", join(baseDirectory, "alias.toss"));
  assert.deepEqual(session.submit("%import('./alias.toss')."), {
    kind: "value",
    display: "22",
  });
  assert.deepEqual(session.submit("$saved value."), {
    kind: "value",
    display: "11",
  });
});

Deno.test("a local macro can generate a REPL module import", () => {
  using temp = fixture({ "value.toss": "%export(41)." });
  const session = createReplSession({ baseDirectory: temp.baseDirectory });
  session.submit(
    "%macro(#loadValue, { syntax -> %quote(%import('./value.toss')) }).",
  );
  assert.deepEqual(session.submit("%loadValue()."), {
    kind: "value",
    display: "41",
  });
});

Deno.test("failed graph candidates cannot collide with later module IDs", () => {
  using temp = fixture({
    "shared.toss": "%export(11).",
    "broken.toss":
      "%import('./shared.toss'). %import('./missing.toss'). %export(0).",
    "retry.toss": "%export(22).",
  });
  const session = createReplSession({ baseDirectory: temp.baseDirectory });
  assert.equal(session.submit("%import('./broken.toss').").kind, "error");
  assert.deepEqual(session.submit("%import('./retry.toss')."), {
    kind: "value",
    display: "22",
  });
  Deno.writeTextFileSync(
    join(temp.baseDirectory, "missing.toss"),
    "%export(33).",
  );
  assert.deepEqual(session.submit("%import('./broken.toss')."), {
    kind: "value",
    display: "0",
  });
  assert.deepEqual(session.submit("%import('./shared.toss')."), {
    kind: "value",
    display: "11",
  });
});
