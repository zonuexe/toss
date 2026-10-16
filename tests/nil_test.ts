import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  { source: "$Nil print. $Nil dump.", output: "nil\nnil\n" },
  { source: "$Nil print dump.", output: "nil\nnil\n" },
  { source: "#Nil bind: 'shadow'. $Nil print.", output: "shadow\n" },
  { source: "({ x -> $x } value: $Nil) print.", output: "nil\n" },
  {
    source: "#o bind: $Object clone. $o at: 'x' put: $Nil. ($o at: 'x') print.",
    output: "nil\n",
  },
  {
    source: "#o bind: $Object clone. $o at: 'x' put: $Nil. ($o x) dump.",
    output: "nil\n",
  },
] as const;

for (const fixture of cases) {
  Deno.test(`Nil behavior for ${fixture.source}`, async () => {
    const result = await execute(fixture.source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), fixture.output);
    assert.equal(text(result.stderr), "");
  });
}

for (
  const [source, diagnostic] of [
    [
      "$Nil missing.",
      'fixture.toss:1:6: RuntimeError: Unknown message "missing" for Nil.',
    ],
    [
      "$Object at: $Nil put: 'x'.",
      "fixture.toss:1:9: RuntimeError: Object key must be a string or symbol.",
    ],
    [
      "#o bind: $Object clone. $o at: 'missing'.",
      'fixture.toss:1:28: RuntimeError: Object has no key "missing".',
    ],
  ] as const
) {
  Deno.test(`Nil and slot error location for ${source}`, async () => {
    const result = await execute(source);
    assert.notEqual(result.code, 0);
    assert.ok(text(result.stderr).includes(diagnostic), text(result.stderr));
  });
}

Deno.test("Nil print and dump each return Nil", async () => {
  const result = await execute("$Nil print dump.");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "nil\nnil\n");
});

Deno.test("Nil dump returns its receiver", async () => {
  const result = await execute("($Nil dump) toString print.");
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "nil\nnil\n");
});
