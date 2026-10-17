import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, executeJavaScript, text } from "./helpers.ts";

for (
  const target of ["1", "'text'", "$True", "$Nil", "[]", "{ 'body' print }"]
) {
  for (const entries of ["", "value: 'unexpected' print"]) {
    Deno.test(`extend rejects ${target} before values: ${entries}`, async () => {
      const result = await execute(
        `'before' print. ${target} |> #extend(${entries}).`,
      );
      assert.notEqual(result.code, 0);
      assert.equal(text(result.stdout), "before\n");
      assert.match(text(result.stderr), /RuntimeError:.*Object/);
    });
  }
}

for (
  const source of [
    "#extend().",
    "$Object clone |> #extend(value:).",
    "$Object clone |> #extend(value: 1,).",
    "$Object clone |> #extend(,value: 1).",
    "$Object clone |> #extend(value 1).",
    "$Object clone |> #extend(value: 1.",
    "$Object clone |> #extend(#key: 1).",
    "$Object clone |> #extend(value: 1,, other: 2).",
    "$Object clone |> #extend (value: 1).",
    "$Object clone |> #other(value: 1).",
  ]
) {
  Deno.test(`extend syntax rejects ${JSON.stringify(source)}`, () => {
    assert.throws(() => compile(source, "invalid.toss"), TossSyntaxError);
  });
}

Deno.test("invalid extension targets report the original macro position", async () => {
  const result = await execute(
    "'before' print.\r\n  [] |> #extend(value: 'unexpected' print).",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "before\n");
  assert.match(text(result.stderr), /fixture\.toss:2:9: RuntimeError:/);
});

Deno.test("a non-callable setter fails at its entry after evaluating the value", async () => {
  const result = await execute(
    "#o bind: $Object clone.\n$o at: 'at:put:' put: 7.\n$o |> #extend(\n  first: 'first' print,\n  later: 'later' print\n).",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "first\n");
  assert.match(
    text(result.stderr),
    /fixture\.toss:4:3: RuntimeError: Object slot "at:put:" is not callable\./,
  );
});

Deno.test("extension failures keep earlier writes at the JavaScript boundary", async () => {
  const setup = compile(
    "#state bind: $Object clone.\n#work bind: {\n  $state |> #extend(\n    first: 1,\n    second: $missing,\n    later: 'later' print\n  )\n}.",
    "fixture.toss",
  );
  const result = await executeJavaScript(
    setup + `
const context = {environment, location: {file: "boundary.js", line: 1, column: 1}};
try {
  send(fetchBinding("work", context), {name: "value", arguments: []}, context);
} catch (error) {
  if (!(error instanceof TossRuntimeError)) throw error;
  console.log(error.message);
}
const state = fetchBinding("state", context);
console.log(send(state, {name: "at:", arguments: ["first"]}, context));
console.log(Reflect.has(state, "second"), Reflect.has(state, "later"));
`,
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(
    text(result.stdout),
    'fixture.toss:5:13: RuntimeError: Unbound name "missing".\n1\nfalse false\n',
  );
  assert.equal(text(result.stderr), "");
});
