import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  {
    name: "binding",
    source: "'Hello' |> #greeting bind:. $greeting print.",
    output: "Hello\n",
  },
  {
    name: "left-associative chains",
    source: "'Hello' |> #a bind: |> #b bind:. $a print. $b print.",
    output: "Hello\nHello\n",
  },
  {
    name: "pipeline returns send result",
    source: "('Hello' |> #a bind:) print.",
    output: "Hello\n",
  },
  {
    name: "unary precedence",
    source: "'Hello' inspect |> #a bind:. $a print.",
    output: '"Hello"\n',
  },
  {
    name: "keyword precedence",
    source: "#a bind: 'Hello' |> #b bind:. $a print. $b print.",
    output: "Hello\nHello\n",
  },
  {
    name: "pipeline in an argument",
    source: "#copy bind: ('Hello' |> #a bind:). $copy print.",
    output: "Hello\n",
  },
  {
    name: "one evaluation before receiver",
    source: "'left' print |> #target print bind:. $target print.",
    output: "left\ntarget\nleft\n",
  },
  {
    name: "receiver sees left-hand effects",
    source: "#key bind: #old. #key bind: #target |> $key bind:. $target dump.",
    output: "#target\n",
  },
  {
    name: "grouped receiver",
    source: "'Hello' |> (#key bind: #target) bind:. $target print.",
    output: "Hello\n",
  },
  {
    name: "symbol value",
    source: "#target |> #key bind:. $key bind: 'Hello'. $target print.",
    output: "Hello\n",
  },
  {
    name: "comments and line breaks",
    source:
      "'Hello' // left\n |> #a // receiver\n bind: // next\n |> #b bind:. $b print.",
    output: "Hello\n",
  },
  { name: "literal pipe", source: "'|>' print.", output: "|>\n" },
] as const;

for (const fixture of cases) {
  Deno.test(`pipeline supports ${fixture.name}`, async () => {
    const result = await execute(fixture.source);

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), fixture.output);
    assert.equal(text(result.stderr), "");
  });
}

Deno.test("pipeline evaluates left, receiver, then explicit arguments", async () => {
  const source = "'left' print |> #target print at: 'key' print put:.";

  const result = await execute(source);

  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "left\ntarget\nkey\n");
  assert.ok(
    text(result.stderr).includes(
      'fixture.toss:1:31: RuntimeError: Unknown message "at:put:" for Symbol.',
    ),
  );
});

Deno.test("pipeline stops when its left side fails", async () => {
  const result = await execute("$missing |> #target print bind:.");

  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.ok(
    text(result.stderr).includes(
      'fixture.toss:1:1: RuntimeError: Unbound name "missing".',
    ),
  );
});

Deno.test("pipeline keeps the receiver's original source location", async () => {
  const result = await execute("'left' print\r\n |> $missing bind:.");

  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "left\n");
  assert.ok(
    text(result.stderr).includes(
      'fixture.toss:2:5: RuntimeError: Unbound name "missing".',
    ),
  );
});
