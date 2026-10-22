import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { text } from "./helpers.ts";
import { runModuleProgram } from "./module_helpers.ts";

for (
  const [name, files, expected] of [
    [
      "primitive export does not follow a later rebinding",
      {
        "main.toss": "%import('./value.toss') print.",
        "value.toss": "#value bind: 1. %export($value). #value bind: 2.",
      },
      "1\n",
    ],
    [
      "Object export retains post-export mutation",
      {
        "main.toss": "%import('./value.toss') name print.",
        "value.toss":
          "#value bind: $Object clone. %export($value). $value at: 'name' put: 'changed'.",
      },
      "changed\n",
    ],
    [
      "exported Block resolves its imports from the defining file",
      {
        "main.toss":
          "#factory bind: %import('./lib/factory.toss'). $factory value print.",
        "lib/factory.toss": "%export({ %import('./value.toss') }).",
        "lib/value.toss": "%export(7).",
        "value.toss": "%export(9).",
      },
      "7\n",
    ],
    [
      "exported methods retain owner-relative parent lookup",
      {
        "main.toss":
          "#base bind: %import('./lib.toss'). #child bind: ($base clone |> %extend(name: 'entry')). $child m print.",
        "lib.toss":
          "#a bind: ($Object clone |> %extend(m: { $self name })). %export($a clone |> %extend(m: { %super() })).",
      },
      "entry\n",
    ],
  ] as const
) {
  Deno.test(`module value: ${name}`, async () => {
    const result = await runModuleProgram(files, "main.toss");
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), expected);
  });
}

for (
  const source of [
    "[%export(1)].",
    "#name bind: %export(1).",
    "%export(1) print.",
    "%export(%export(1)).",
    "$Object clone |> %extend(value: %export(1)).",
    "%super(%export(1)).",
    "%export(1). %export(2).",
  ]
) {
  Deno.test(`export requires a single standalone root statement: ${source}`, () => {
    assert.throws(() => compile(source, "placement.toss"), TossSyntaxError);
  });
}
