import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { execute, executeJavaScript, text } from "./helpers.ts";

const cases = [
  {
    name: "bind and fetch",
    source: "#greeting bind: 'Hello'. $greeting print.",
    output: "Hello\n",
  },
  {
    name: "rebinding",
    source: "#x bind: 'first'. #x bind: 'second'. $x print.",
    output: "second\n",
  },
  {
    name: "symbol alias",
    source: "#key bind: #greeting. $key bind: 'Hello'. $greeting print.",
    output: "Hello\n",
  },
  {
    name: "symbol output",
    source: "#greeting print dump.",
    output: "greeting\n#greeting\n",
  },
  {
    name: "symbol conversions",
    source: "#x toString dump. #x inspect dump.",
    output: '"x"\n"#x"\n',
  },
  {
    name: "symbol dump preserves symbol",
    source: "#x dump bind: 'value'. $x print.",
    output: "#x\nvalue\n",
  },
  {
    name: "unary argument precedence",
    source: "#x bind: 'value' print. $x print.",
    output: "value\nvalue\n",
  },
  {
    name: "unary receiver precedence",
    source: "#x print bind: 'value'. $x print.",
    output: "x\nvalue\n",
  },
  {
    name: "chained argument sends",
    source: "#x bind: 'value' inspect print. $x print.",
    output: '"value"\n"value"\n',
  },
  {
    name: "fetch as argument",
    source: "#x bind: 'value'. #y bind: $x. $y print.",
    output: "value\n",
  },
  { name: "empty binding", source: "#x bind: ''. $x dump.", output: '""\n' },
  {
    name: "names cannot collide with runtime",
    source:
      "#environment bind: 'safe'. #constructor bind: $environment. #__proto__ bind: $constructor. $__proto__ print.",
    output: "safe\n",
  },
  {
    name: "case-sensitive names",
    source: "#x bind: 'lower'. #X bind: 'upper'. $x print. $X print.",
    output: "lower\nupper\n",
  },
  {
    name: "comments between arguments",
    source: "#x // receiver\n bind: // argument\n 'value'. $x print.",
    output: "value\n",
  },
  {
    name: "unbound symbols are values",
    source: "#unbound. #unbound print.",
    output: "unbound\n",
  },
  {
    name: "planned macro names remain named symbols",
    source:
      "#extend bind: 'extend'. #import bind: 'import'. #let bind: 'let'. #const bind: 'const'. #regex bind: 'regex'. #super bind: 'super'. #extend inspect print. #import inspect print. #let inspect print. #const inspect print. #regex inspect print. #super inspect print.",
    output: "#extend\n#import\n#let\n#const\n#regex\n#super\n",
  },
] as const;

for (const fixture of cases) {
  Deno.test(`supports ${fixture.name}`, async () => {
    const result = await execute(fixture.source);

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), fixture.output);
    assert.equal(text(result.stderr), "");
  });
}

const failures = [
  {
    source: "$missing print.",
    output: "",
    diagnostic: 'fixture.toss:1:1: RuntimeError: Unbound name "missing".',
  },
  {
    source: "'before' print.\r\n  $later. #later bind: 'value'.",
    output: "before\n",
    diagnostic: 'fixture.toss:2:3: RuntimeError: Unbound name "later".',
  },
  {
    source: "#x missing.",
    output: "",
    diagnostic:
      'fixture.toss:1:4: RuntimeError: Unknown message "missing" for Symbol.',
  },
  {
    source: "'x' bind: 'value'.",
    output: "",
    diagnostic:
      'fixture.toss:1:5: RuntimeError: Unknown message "bind:" for String.',
  },
  {
    source: "#x at: 'key' put: 'value'.",
    output: "",
    diagnostic:
      'fixture.toss:1:4: RuntimeError: Unknown message "at:put:" for Symbol.',
  },
  {
    source: "'receiver' print at: 'first' print put: 'second' print.",
    output: "receiver\nfirst\nsecond\n",
    diagnostic:
      'fixture.toss:1:18: RuntimeError: Unknown message "at:put:" for String.',
  },
] as const;

for (const fixture of failures) {
  Deno.test(`reports binding or message error for ${fixture.source}`, async () => {
    const result = await execute(fixture.source);

    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), fixture.output);
    assert.ok(
      text(result.stderr).includes(fixture.diagnostic),
      text(result.stderr),
    );
    assert.ok(!text(result.stderr).includes("program.js:"));
  });
}

Deno.test("bind returns the stored value", async () => {
  const javascript = compile("#seed.", "fixture.toss") + `
const value = send(Symbol.for("key"), {name: "bind:", arguments: ["stored"]}, {location: {file: "fixture.toss", line: 1, column: 1}, environment});
console.log(value);
`;

  const result = await executeJavaScript(javascript);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "stored\n");
});

Deno.test("generated files keep separate environments", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-environments-" });
  try {
    await Deno.writeTextFile(
      `${directory}/first.js`,
      compile("#shared bind: 'private'.", "first.toss"),
    );
    await Deno.writeTextFile(
      `${directory}/second.js`,
      compile("$shared print.", "second.toss"),
    );
    await Deno.writeTextFile(
      `${directory}/main.js`,
      'import "./first.js"; import "./second.js";',
    );

    const result = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-config", "--no-prompt", `${directory}/main.js`],
      stdout: "piped",
      stderr: "piped",
    }).output();

    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "");
    assert.ok(
      text(result.stderr).includes(
        'second.toss:1:1: RuntimeError: Unbound name "shared".',
      ),
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
