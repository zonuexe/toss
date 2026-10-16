import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  [
    "decimal and statement periods",
    "1. 2 print. 3.5 print. -0.25 print. 0012 print.",
    "2\n3.5\n-0.25\n12\n",
  ],
  [
    "addition and floating point",
    "(2 add: 3) print. (0.1 add: 0.2) print.",
    "5\n0.30000000000000004\n",
  ],
  ["subtraction", "(2 subtract: -3) print. (2 subtract: 3) print.", "5\n-1\n"],
  ["multiplication", "(2.5 multiplyBy: -2) print.", "-5\n"],
  ["division", "(7 divideBy: 2) print.", "3.5\n"],
  [
    "remainder sign",
    "(-7 remainder: 3) print. (7 remainder: -3) print.",
    "-1\n1\n",
  ],
  ["negation", "-2 negated print. 3 negated print.", "2\n-3\n"],
  [
    "number output returns receiver",
    "2 print negated dump negated print.",
    "2\n-2\n2\n",
  ],
  [
    "boolean output and negation",
    "$True print not dump not print. $False inspect print.",
    "true\nfalse\ntrue\nfalse\n",
  ],
  [
    "numeric conversions",
    "2.5 toString dump. -3 inspect dump.",
    '"2.5"\n"-3"\n',
  ],
  [
    "boolean shadowing",
    "#True bind: 'shadow'. (1 lessThan: 2) not print. $True print.",
    "false\nshadow\n",
  ],
  [
    "false binding follows lexical scope",
    "{ #False bind: 'local'. $False print } value. $False print.",
    "local\nfalse\n",
  ],
  [
    "evaluation order and count",
    "((8 print) subtract: (3 print)) print.",
    "8\n3\n5\n",
  ],
  [
    "pipeline and slots",
    "#o bind: $Object clone. 4 |> $o at: 'n' put:. (2 |> ($o at: 'n') add:) print.",
    "6\n",
  ],
  [
    "method argument and closure",
    "#o bind: $Object clone. $o at: 'f:' put: { x -> { $x negated } }. ($o f: 12) value print.",
    "-12\n",
  ],
  [
    "digit names and arrow",
    "#x2 bind: 2. ({ n1 -> $n1 add: $x2 } value: 3) print.",
    "5\n",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`numbers and booleans: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

for (
  const [selector, left, right] of [
    ["equals:", 2, 3],
    ["lessThan:", 3, 2],
    ["greaterThan:", 1, 2],
    ["lessThanOrEqual:", 3, 2],
    ["greaterThanOrEqual:", 1, 2],
  ] as const
) {
  Deno.test(`numeric comparison boundaries for ${selector}`, async () => {
    const equalExpected =
      selector === "lessThan:" || selector === "greaterThan:"
        ? "false"
        : "true";
    const result = await execute(
      `(2 ${selector} 2) print. (${left} ${selector} ${right}) print.`,
    );
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), `${equalExpected}\nfalse\n`);
  });
}

for (
  const selector of [
    "lessThan:",
    "greaterThan:",
    "lessThanOrEqual:",
    "greaterThanOrEqual:",
  ] as const
) {
  Deno.test(`numeric ordering can return true for ${selector}`, async () => {
    const left = selector.startsWith("less") ? 1 : 3;
    const result = await execute(`(${left} ${selector} 2) not print.`);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), "false\n");
  });
}

const large = "1" + "0".repeat(200);
for (
  const [source, reason] of [
    ["1 divideBy: 0.", "Division by zero."],
    ["1 divideBy: -0.", "Division by zero."],
    ["1 remainder: 0.", "Remainder by zero."],
    ["1 remainder: -0.", "Remainder by zero."],
    [`${large} multiplyBy: ${large}.`, "Number result must be finite."],
    ["1 add: '2'.", "Number argument required."],
    ["1 equals: $True.", "Number argument required."],
    ["1 lessThan: $Nil.", "Number argument required."],
    ["1 multiplyBy: $Object.", "Number argument required."],
    ["$Object at: 1 put: 'x'.", "Object key must be a string or symbol."],
    ["$Object at: $True.", "Object key must be a string or symbol."],
    ["1 missing.", 'Unknown message "missing" for Number.'],
    ["$False missing.", 'Unknown message "missing" for Boolean.'],
  ] as const
) {
  Deno.test(`primitive runtime error: ${source}`, async () => {
    const result = await execute(source);
    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "");
    assert.ok(
      text(result.stderr).includes(`RuntimeError: ${reason}`),
      text(result.stderr),
    );
  });
}

Deno.test("numeric runtime errors retain the original call position", async () => {
  const result = await execute("'before' print.\r\n  1 divideBy: 0.");
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "before\n");
  assert.ok(
    text(result.stderr).includes(
      "fixture.toss:2:5: RuntimeError: Division by zero.",
    ),
    text(result.stderr),
  );
});
