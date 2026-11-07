import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { createReplSession } from "../src/repl.ts";
import { execute, executeModuleJavaScript, text } from "./helpers.ts";

const cases: readonly (readonly [string, string, string])[] = [
  ...["\n", "\r", "\r\n", "\u2028", "\u2029"].flatMap((newline) =>
    [
      [
        `line comment ending in ${JSON.stringify(newline)}`,
        `%js(42 // ignored ) ;${newline})`,
        "42",
      ],
      [
        `HTML opening comment ending in ${JSON.stringify(newline)}`,
        `%js(42 <!-- ignored ) ;${newline})`,
        "42",
      ],
      [
        `HTML closing comment after ${JSON.stringify(newline)}`,
        `%js(42${newline}  --> ignored ) ;${newline})`,
        "42",
      ],
    ] satisfies readonly (readonly [string, string, string])[]
  ),
  [
    "HTML closing comment after a multiline block comment",
    "%js(42 /* before\n after */ --> ignored ) ;\n)",
    "42",
  ],
  [
    "HTML opening comment before a bound expression",
    "%js(value = 40; <!-- ignored ) ;\nvalue + 2)",
    "42",
  ],
  [
    "HTML closing comment before a bound expression",
    "%js(value = 40;\n --> ignored ) ;\nvalue + 2)",
    "42",
  ],
  [
    "comment markers in a string",
    "%js('<!-- --> // /* */')",
    "<!-- --> // /* */",
  ],
  [
    "comment markers in a template",
    "%js(`<!-- ${40 + 2} -->`)",
    "<!-- 42 -->",
  ],
  [
    "comment markers in a regular expression",
    "%js(/<!--|-->/.test('<!--'))",
    "true",
  ],
  [
    "same-line decrement and comparison",
    "%js((() => { let value = 42; return value-->40; })())",
    "true",
  ],
];

for (const [name, source, expected] of cases) {
  Deno.test(`JS trivia in a compiled program: ${name}`, async () => {
    const result = await execute(`${source} print.`);

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), `${expected}\n`);
    assert.equal(text(result.stderr), "");
  });

  Deno.test(`JS trivia in an ES module: ${name}`, async () => {
    const javascript = compile(`%export(${source}).`, "trivia.toss", {
      format: "esm",
    });

    const result = await executeModuleJavaScript(
      javascript,
      "console.log(value);",
    );

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), `${expected}\n`);
    assert.equal(text(result.stderr), "");
  });

  Deno.test(`JS trivia in a REPL session: ${name}`, () => {
    const session = createReplSession();

    const result = session.submit(`${source} toString.`);

    assert.deepEqual(result, {
      kind: "value",
      display: JSON.stringify(expected),
    });
  });
}

Deno.test("same-line HTML closing marker is not a trailing comment", () => {
  const source = "%js(42 --> ignored\n).";

  assert.throws(() => compile(source, "trivia.toss"), TossSyntaxError);
});

Deno.test("REPL CLI waits for a closing delimiter after a trailing HTML comment", async () => {
  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", "--no-prompt", "src/repl_cli.ts"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();

  await writer.write(new TextEncoder().encode("%js(42 <!-- ignored ) ;\n).\n"));
  await writer.close();
  const result = await child.output();

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "=> 42\n");
  assert.equal(text(result.stderr), "");
});
