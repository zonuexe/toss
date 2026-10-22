import assert from "node:assert/strict";
import { createReplSession } from "../src/repl.ts";

Deno.test("session keeps bindings, rebinding, and closure identity", () => {
  const session = createReplSession();
  assert.deepEqual(session.submit("#x bind: 1."), {
    kind: "value",
    display: "1",
  });
  assert.equal(session.submit("#read bind: { $x }.").kind, "error");
  assert.deepEqual(session.submit("#x bind: 2."), {
    kind: "value",
    display: "2",
  });
  assert.deepEqual(session.submit("$read value."), {
    kind: "value",
    display: "2",
  });
});

Deno.test("session shares mutated arrays and object identity", () => {
  const session = createReplSession();
  assert.equal(session.submit("#array bind: [1].").kind, "value");
  assert.equal(session.submit("$array at: 0 put: 9.").kind, "value");
  assert.deepEqual(session.submit("$array."), {
    kind: "value",
    display: "[9]",
  });
  assert.equal(session.submit("#object bind: $Object clone.").kind, "error");
  assert.equal(
    session.submit("$object at: 'key' put: 'shared'.").kind,
    "value",
  );
  assert.deepEqual(session.submit("$object at: 'key'."), {
    kind: "value",
    display: '"shared"',
  });
});

Deno.test("local macros persist, retain hygiene, and reject duplicates", () => {
  const session = createReplSession();
  assert.deepEqual(
    session.submit("%macro(#identity, { syntax -> $syntax })."),
    {
      kind: "empty",
    },
  );
  assert.deepEqual(session.submit("%identity(7)."), {
    kind: "value",
    display: "7",
  });
  assert.equal(
    session.submit("%macro(#identity, { syntax -> $syntax }).").kind,
    "error",
  );
  assert.deepEqual(session.submit("%identity(8)."), {
    kind: "value",
    display: "8",
  });
});

Deno.test("macros retain definition-site bindings across cells", () => {
  const session = createReplSession();
  assert.deepEqual(session.submit("#offset bind: 10."), {
    kind: "value",
    display: "10",
  });
  assert.deepEqual(
    session.submit(
      "%macro(#bump, { syntax -> %`((%,($syntax)) add: $offset) }).",
    ),
    { kind: "empty" },
  );
  assert.deepEqual(
    session.submit("({ offset -> %bump($offset) } value: 3)."),
    { kind: "value", display: "13" },
  );
});

Deno.test("syntax errors commit neither macro definitions nor runtime effects", () => {
  const session = createReplSession();
  const failed = session.submit(
    "%macro(#temporary, { syntax -> $syntax }). #ran bind: 1. 'bad' add:.",
  );
  assert.equal(failed.kind, "error");
  assert.equal(session.submit("$ran.").kind, "error");
  const macroFailure = session.submit("%temporary(1).");
  assert.equal(macroFailure.kind, "error");
  assert.match(macroFailure.message, /Macro %temporary is not defined/);
});

Deno.test("runtime failures retain effects and compiled macros", () => {
  const session = createReplSession();
  const result = session.submit(
    "%macro(#seven, { syntax -> %quote(7) }). #kept bind: 'yes'. $missing.",
  );
  assert.equal(result.kind, "error");
  assert.deepEqual(session.submit("$kept."), {
    kind: "value",
    display: '"yes"',
  });
  assert.deepEqual(session.submit("%seven()."), {
    kind: "value",
    display: "7",
  });
});

Deno.test("custom inspect failures recover on the next submission", () => {
  const session = createReplSession();
  assert.equal(session.submit("#object bind: $Object clone.").kind, "error");
  assert.equal(
    session.submit("$object at: 'inspect' put: { 1 }.").kind,
    "error",
  );
  const failure = session.submit("$object.");
  assert.equal(failure.kind, "error");
  assert.match(failure.message, /inspect must return a string/);
  assert.deepEqual(session.submit("3."), { kind: "value", display: "3" });
});

Deno.test("JavaScript runtime errors retain their host cause in diagnostics", () => {
  const session = createReplSession();
  const failure = session.submit(
    "%js((() => { throw new Error('host failure'); })()).",
  );
  assert.equal(failure.kind, "error");
  assert.match(failure.message, /JavaScript expression threw/);
  assert.match(failure.message, /caused by: host failure/);
});

Deno.test("unsupported import forms are rejected inside unused code", () => {
  for (
    const form of [
      "%import('x')",
      "%jsImport('x')",
      "%macroImport('x')",
      "%export(1)",
    ]
  ) {
    const session = createReplSession();
    const result = session.submit(
      `%js(globalThis.__tossSideEffect = true). { ${form} }.`,
    );
    assert.equal(result.kind, "error");
    assert.match(
      result.message,
      new RegExp(`${form.slice(0, form.indexOf("("))} is not supported`),
    );
    assert.deepEqual(
      session.submit("%js(globalThis.__tossSideEffect === undefined)."),
      { kind: "value", display: "true" },
    );
  }
});

Deno.test("reset creates a fresh runtime and macro context", () => {
  const session = createReplSession();
  session.submit("#key bind: 1.");
  session.submit("%macro(#seven, { syntax -> %quote(7) }).");
  session.reset();
  assert.equal(session.submit("$key.").kind, "error");
  assert.equal(session.submit("%seven().").kind, "error");
});
