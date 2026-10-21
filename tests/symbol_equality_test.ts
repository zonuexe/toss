import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

for (
  const [name, source, output] of [
    ["same named", "(#same equals: #same) print.", "true\n"],
    ["different named", "(#same equals: #other) print.", "false\n"],
    [
      "unique alias",
      "#u bind: $Symbol generateUnique. #alias bind: $u. ($u equals: $alias) print.",
      "true\n",
    ],
    [
      "separate unique",
      "#u bind: $Symbol generateUnique. #v bind: $Symbol generateUnique. ($u equals: $v) print.",
      "false\n",
    ],
    [
      "unique versus named",
      "($Symbol generateUnique equals: #name) print.",
      "false\n",
    ],
    [
      "equality macro Boolean branch",
      "#a bind: #same. #b bind: #same. $($a == $b) ifTrue: { 'yes' print } ifFalse: { 'no' print }.",
      "yes\n",
    ],
    [
      "inequality macro",
      "#u bind: $Symbol generateUnique. #v bind: $Symbol generateUnique. $($u != $v) print.",
      "true\n",
    ],
  ] as const
) {
  Deno.test(`Symbol equality: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

for (const argument of ["'x'", "1", "$True", "$Nil", "$Object", "[]", "{}"]) {
  Deno.test(`symbol equality rejects ${argument} at the message location`, async () => {
    const result = await execute(
      `'before' print.\n  #name equals: ${argument}.`,
    );
    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "before\n");
    assert.match(
      text(result.stderr),
      /fixture\.toss:2:9: RuntimeError: Symbol argument required\./,
    );
  });
}
