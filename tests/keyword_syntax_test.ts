import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";

for (
  const source of [
    "#.",
    "$.",
    "#1name.",
    "$1name.",
    "#日本語.",
    "#x bind:.",
    "#x bind:",
    "#x at: 'key' put:.",
    "#x bind: 'value' put:.",
    "#x bind: ().",
    "#x bind: 'value' |> #y bind:.",
    "#x bind: 'value'\n$x print.",
  ]
) {
  Deno.test(`rejects malformed or deferred syntax ${JSON.stringify(source)}`, () => {
    assert.throws(() => compile(source, "invalid.toss"), TossSyntaxError);
  });
}
