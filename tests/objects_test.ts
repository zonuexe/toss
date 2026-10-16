import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { execute, text } from "./helpers.ts";

const cases = [
  {
    name: "fresh root",
    source: "$Object at: 'missing'.",
    error: 'fixture.toss:1:9: RuntimeError: Object has no key "missing".',
  },
  {
    name: "root does not inherit native prototype keys",
    source: "$Object at: 'constructor'.",
    error: 'fixture.toss:1:9: RuntimeError: Object has no key "constructor".',
  },
  {
    name: "clone creates independent objects",
    source:
      "#a bind: $Object clone. #b bind: $Object clone. $a at: 'x' put: 'A'. $b at: 'x' put: 'B'. ($a at: 'x') print. ($b at: 'x') print.",
    output: "A\nB\n",
  },
  {
    name: "inherited value and parent updates",
    source:
      "#parent bind: $Object clone. $parent at: 'x' put: 'old'. #child bind: $parent clone. ($child at: 'x') print. $parent at: 'x' put: 'new'. ($child at: 'x') print.",
    output: "old\nnew\n",
  },
  {
    name: "child override",
    source:
      "#p bind: $Object clone. $p at: 'x' put: 'parent'. #c bind: $p clone. $c at: 'x' put: 'child'. ($c at: 'x') print. ($p at: 'x') print.",
    output: "child\nparent\n",
  },
  {
    name: "string and symbol keys differ",
    source:
      "#o bind: $Object clone. $o at: 'name' put: 'string'. $o at: #name put: 'symbol'. ($o at: 'name') print. ($o at: #name) print.",
    output: "string\nsymbol\n",
  },
  {
    name: "special names are safe own slots",
    source:
      "#o bind: $Object clone. $o at: '__proto__' put: 'proto'. $o at: 'constructor' put: 'ctor'. $o at: 'toString' put: 'string'. ($o at: '__proto__') print. ($o at: 'constructor') print. ($o at: 'toString') print.",
    output: "proto\nctor\nstring\n",
  },
  {
    name: "pipeline supplies final at:put: argument",
    source:
      "#o bind: $Object clone. 'value' |> $o at: 'key' put:. ($o at: 'key') print.",
    output: "value\n",
  },
  {
    name: "at:put: returns and stores its value",
    source:
      "#o bind: $Object clone. ($o at: 'key' put: 'stored') print. ($o at: 'key') print.",
    output: "stored\nstored\n",
  },
  {
    name: "stored block runs only when explicitly sent value",
    source:
      "#o bind: $Object clone. $o at: 'block' put: { 'called' print }. #stored bind: ($o at: 'block'). 'before' print. $stored value. 'after' print.",
    output: "before\ncalled\nafter\n",
  },
] as const;

for (const fixture of cases) {
  Deno.test(`objects: ${fixture.name}`, async () => {
    const result = await execute(fixture.source);
    if ("error" in fixture) {
      assert.notEqual(result.code, 0);
      assert.ok(
        text(result.stderr).includes(fixture.error),
        text(result.stderr),
      );
    } else {
      assert.equal(result.code, 0, text(result.stderr));
      assert.equal(text(result.stdout), fixture.output);
      assert.equal(text(result.stderr), "");
    }
  });
}

for (
  const [source, location, detail] of [
    [
      "#o bind: $Object clone. $o at: 'x'.",
      "fixture.toss:1:28",
      'Object has no key "x".',
    ],
    [
      "#o bind: $Object clone. $o mystery.",
      "fixture.toss:1:28",
      'Unknown message "mystery" for Object.',
    ],
  ] as const
) {
  Deno.test(`objects report source-positioned error: ${detail}`, async () => {
    const result = await execute(source);
    assert.notEqual(result.code, 0);
    assert.ok(
      text(result.stderr).includes(`${location}: RuntimeError: ${detail}`),
      text(result.stderr),
    );
    assert.ok(!text(result.stderr).includes("program.js:"));
  });
}

Deno.test("generated object prelude is source safe", async () => {
  const result = await execute(
    "$Object at: '__proto__' put: 'ok'. ($Object at: '__proto__') print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "ok\n");
});

Deno.test("object operations reject invalid keys at their source locations", async () => {
  for (
    const [source, location] of [
      ["#key bind: { 'x' }. $Object at: $key.", "fixture.toss:1:29"],
      [
        "#key bind: $Object clone. $Object at: $key put: 'x'.",
        "fixture.toss:1:35",
      ],
    ] as const
  ) {
    const result = await execute(source);
    assert.notEqual(result.code, 0);
    assert.ok(
      text(result.stderr).includes(
        `${location}: RuntimeError: Object key must be a string or symbol.`,
      ),
      text(result.stderr),
    );
  }
});

Deno.test("generated files own isolated Object roots", async () => {
  const directory = await Deno.makeTempDir({ prefix: "toss-objects-" });
  try {
    await Deno.writeTextFile(
      `${directory}/first.js`,
      compile("$Object at: 'private' put: 'A'.", "first.toss"),
    );
    await Deno.writeTextFile(
      `${directory}/second.js`,
      compile("$Object at: 'private'.", "second.toss"),
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
    assert.ok(
      text(result.stderr).includes(
        'second.toss:1:9: RuntimeError: Object has no key "private".',
      ),
      text(result.stderr),
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("Object follows ordinary block scope and shadowing", async () => {
  const result = await execute(
    "#f bind: { #Object bind: 'local'. $Object print }. $f value.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "local\n");
});
