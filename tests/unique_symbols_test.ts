import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  [
    "fresh keys and named symbols are separate",
    "#key bind: $Symbol generateUnique. #other bind: $Symbol generateUnique. #o bind: $Object clone. $o at: $key put: 'first'. $o at: $other put: 'second'. $o at: #key put: 'named'. [$o at: $key, $o at: $other, $o at: #key] dump.",
    '["first", "second", "named"]\n',
  ],
  [
    "computed extension and inherited dynamic methods preserve self",
    "#key bind: $Symbol generateUnique. #method bind: $Symbol generateUnique. #p bind: ($Object clone |> %extend(($key): 'parent', ($method): { a, b -> [$self at: $key, $a, $b] })). #c bind: $p clone. ($c perform: $method withArguments: [1, 2]) dump.",
    '["parent", 1, 2]\n',
  ],
  [
    "unique displays work in arrays, print and dump",
    "#key bind: $Symbol generateUnique. $key print. $key dump. [$key] dump.",
    "<unique>\n#<unique>\n[#<unique>]\n",
  ],
  [
    "factory follows ordinary override, clone and shadow rules",
    "#factory bind: $Symbol clone. $factory at: 'generateUnique' put: { #override }. #made bind: $factory generateUnique. $made dump. #f bind: { #Symbol bind: ($Object clone |> %extend(generateUnique: { #local })). $Symbol generateUnique }. $f value dump.",
    "#override\n#local\n",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`unique symbols: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

for (
  const [source, expected, location] of [
    [
      "#key bind: $Symbol generateUnique. $Object at: $key.",
      "Object has no key #<unique>.",
      "fixture.toss:1:44",
    ],
    [
      "#key bind: $Symbol generateUnique. $Object perform: $key.",
      "Unknown message #<unique> for Object.",
      "fixture.toss:1:44",
    ],
  ] as const
) {
  Deno.test(`unique symbols: diagnostics use stable labels for ${expected}`, async () => {
    const result = await execute(source);
    assert.notEqual(result.code, 0);
    assert.ok(
      text(result.stderr).includes(`${location}: RuntimeError: ${expected}`),
      text(result.stderr),
    );
  });
}
