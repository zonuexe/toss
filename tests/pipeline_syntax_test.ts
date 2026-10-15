import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";

for (
  const source of [
    "'x' |> #target print.",
    "'x' |> #target.",
    "'x' |> #target bind: 'explicit'.",
    "'x' |> #target at: 'a' put: 'b'.",
    "'x' |> #target at: put: 'b'.",
    "'x' |> #target at: put:.",
    "'x' |>.",
    "'x' |>",
    "|> #target bind:.",
    "'x' |> |> #target bind:.",
    "'x' |> #target bind: print.",
    "'x' |> (#target bind:).",
  ]
) {
  Deno.test(`rejects malformed pipeline ${JSON.stringify(source)}`, () => {
    assert.throws(() => compile(source, "invalid.toss"), TossSyntaxError);
  });
}
