import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const successes = [
  [
    "keys with identical displays still address separate slots",
    "#a bind: $Symbol generateUnique. #b bind: $Symbol generateUnique. #o bind: ($Object clone |> %extend(($a): 1, ($b): 2, (#a): 3)). [$a,$b] dump. [$o at: $a,$o at: $b,$o at: #a] dump.",
    "[#<unique>, #<unique>]\n[1, 2, 3]\n",
  ],
  [
    "inherited unique method accepts arguments with child self",
    "#key bind: $Symbol generateUnique. #p bind: ($Object clone |> %extend(($key): { n -> $self base add: $n })). #c bind: ($p clone |> %extend(base: 20)). ($c perform: $key withArguments: [3]) print.",
    "23\n",
  ],
  [
    "unique environment binding cannot replace named binding",
    "#name bind: 'named'. #key bind: $Symbol generateUnique. $key bind: 'unique'. $name print.",
    "named\n",
  ],
  [
    "factory binding shadows lexically without changing captured factory",
    "#factory bind: $Symbol. { #Symbol bind: 'local'. $Symbol print. $factory generateUnique dump } value. $Symbol generateUnique dump.",
    "local\n#<unique>\n#<unique>\n",
  ],
  [
    "factory clone inherits generator before overriding its own slot",
    "#c bind: $Symbol clone. $c generateUnique dump. $c at: 'generateUnique' put: { #custom }. $c generateUnique dump. $Symbol generateUnique dump.",
    "#<unique>\n#custom\n#<unique>\n",
  ],
] as const;

for (const [name, source, output] of successes) {
  Deno.test(`unique symbol edge: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
  });
}

Deno.test("unique selector errors show a generic key at the call site", async () => {
  const result = await execute(
    "#key bind: $Symbol generateUnique.\n$Object perform: $key withArguments: [].\n'after' print.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(text(result.stderr), /fixture\.toss:2:9: RuntimeError:/);
  assert.match(text(result.stderr), /Unknown message #<unique> for Object/);
});

Deno.test("unique generator checks its zero parameter arity", async () => {
  const result = await execute(
    "$Symbol perform: 'generateUnique' withArguments: [1].",
  );
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /Block expects 0 argument\(s\), received 1/,
  );
});

Deno.test("unique generator is not an Object prelude fallback", async () => {
  const result = await execute("$Object generateUnique.");
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /Unknown message "generateUnique" for Object/,
  );
});
