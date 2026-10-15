import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { execute, executeJavaScript, text } from "./helpers.ts";

const cases = [
  {
    name: "toString returns the string",
    source: "'Hello' toString print.",
    output: "Hello\n",
  },
  {
    name: "inspect returns quoted text",
    source: "'Hello' inspect print.",
    output: '"Hello"\n',
  },
  {
    name: "conversions do not write output",
    source: "'Hello' toString. 'Hello' inspect.",
    output: "",
  },
  {
    name: "dump writes quoted text",
    source: "'Hello' dump.",
    output: '"Hello"\n',
  },
  {
    name: "dump returns the receiver",
    source: "'Hello' dump print.",
    output: '"Hello"\nHello\n',
  },
  {
    name: "print returns the receiver",
    source: "'Hello' print dump.",
    output: 'Hello\n"Hello"\n',
  },
  { name: "empty string inspection", source: "'' dump.", output: '""\n' },
  {
    name: "literal controls are escaped",
    source: "'a\tb\r\nc' dump.",
    output: '"a\\tb\\r\\nc"\n',
  },
  {
    name: "backslashes stay distinct from controls",
    source: String.raw`'\n\t' dump.`,
    output: '"\\\\n\\\\t"\n',
  },
  {
    name: "quotes are escaped",
    source: `'say "hi"' dump.`,
    output: '"say \\"hi\\""\n',
  },
  {
    name: "Unicode is preserved",
    source: "'こんにちは' dump.",
    output: '"こんにちは"\n',
  },
] as const;

for (const fixture of cases) {
  Deno.test(fixture.name, async () => {
    const result = await execute(fixture.source);

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), fixture.output);
    assert.equal(text(result.stderr), "");
  });
}

for (
  const [outputMessage, conversion] of [["print", "toString"], [
    "dump",
    "inspect",
  ]] as const
) {
  Deno.test(`${outputMessage} dispatches ${conversion} and keeps the original receiver`, async () => {
    const javascript = compile("'seed' print.", "fixture.toss") + `
stringMessages.set(${JSON.stringify(conversion)}, () => "converted");
const result = send("original", {name: ${
      JSON.stringify(outputMessage)
    }, arguments: []}, {file: "fixture.toss", line: 2, column: 1});
console.log(result);
`;

    const result = await executeJavaScript(javascript);

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "seed\nconverted\noriginal\n");
  });

  Deno.test(`${outputMessage} rejects a non-string ${conversion} result`, async () => {
    const javascript = compile("'seed' print.", "fixture.toss") + `
stringMessages.set(${JSON.stringify(conversion)}, () => 42);
send("original", {name: ${
      JSON.stringify(outputMessage)
    }, arguments: []}, {file: "fixture.toss", line: 2, column: 3});
`;

    const result = await executeJavaScript(javascript);

    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "seed\n");
    assert.ok(
      text(result.stderr).includes(
        `fixture.toss:2:3: RuntimeError: ${conversion} must return a string.`,
      ),
    );
  });
}
