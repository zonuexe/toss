import assert from "node:assert/strict";
import { createReplSession } from "../src/repl.ts";
import { createBrowserReplSession } from "../src/repl_core.ts";
import { text } from "./helpers.ts";

for (
  const [name, cause] of [
    [
      "throwing prototype lookup",
      "new Proxy({}, { getPrototypeOf() { throw 99; } })",
    ],
    [
      "revoked Proxy",
      "(() => { const pair = Proxy.revocable({}, {}); pair.revoke(); return pair.proxy; })()",
    ],
    [
      "throwing message getter",
      "Object.defineProperty(new Error(), 'message', { get() { throw 99; } })",
    ],
    [
      "non-string message with throwing coercion",
      "Object.defineProperty(new Error(), 'message', { value: { toString() { throw 99; } } })",
    ],
  ] as const
) {
  Deno.test(`REPL recovers from a JS exception with ${name}`, () => {
    const session = createReplSession();

    const failure = session.submit(`%js((() => { throw ${cause}; })()).`);

    assert.deepEqual(failure, {
      kind: "error",
      message: "<repl>:1:1: RuntimeError: JavaScript expression threw.",
    });
    assert.deepEqual(session.submit("42."), { kind: "value", display: "42" });
  });
}

Deno.test("REPL inspection errors survive an unprintable JS cause", () => {
  const session = createReplSession();

  const failure = session.submit(
    "$Object clone |> %extend(inspect: { %js((() => { throw new Proxy({}, { getPrototypeOf() { throw 99; } }); })()) }).",
  );

  assert.equal(failure.kind, "error");
  assert.match(
    failure.message,
    /^<repl>:1:\d+: RuntimeError: JavaScript expression threw\.$/,
  );
  assert.deepEqual(session.submit("42."), { kind: "value", display: "42" });
});

Deno.test("browser REPL output failures survive an unprintable host cause", async () => {
  const pair = Proxy.revocable({}, {});
  pair.revoke();
  const session = createBrowserReplSession({
    onOutput: () => {
      throw pair.proxy;
    },
  });

  const failure = await session.submit("'output' print.");

  assert.equal(failure.kind, "error");
  assert.match(
    failure.message,
    /^<repl>:1:\d+: RuntimeError: REPL output handler failed\.$/,
  );
  assert.deepEqual(await session.submit("42."), {
    kind: "value",
    display: "42",
  });
});

Deno.test("REPL CLI continues after a JS exception with a throwing cause getter", async () => {
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "--no-prompt", "src/repl_cli.ts"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();

  await writer.write(new TextEncoder().encode(
    "%js((() => { throw Object.defineProperty(new Error(), 'message', { get() { throw 99; } }); })()).\n42.\n",
  ));
  await writer.close();
  const result = await child.output();

  assert.equal(result.code, 1);
  assert.equal(text(result.stdout), "=> 42\n");
  assert.equal(
    text(result.stderr),
    "<repl>:1:1: RuntimeError: JavaScript expression threw.\n",
  );
});
