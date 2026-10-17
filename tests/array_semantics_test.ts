import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

for (
  const [name, source, output] of [
    [
      "element effects run exactly once",
      "#a bind: ['first' print, 'second' print]. ($a at: 1) print.",
      "first\nsecond\nsecond\n",
    ],
    [
      "pipeline ends at closing bracket",
      "#a bind: [2 |> #saved bind:]. ($a at: 0) print. $saved print.",
      "2\n2\n",
    ],
    [
      "comments between elements",
      "([1, // element boundary\n2] at: 1) print.",
      "2\n",
    ],
    [
      "nested arrays preserve references",
      "#inner bind: [0]. #outer bind: [$inner]. ($outer at: 0) at: -0 put: 9. ($inner at: 0) print.",
      "9\n",
    ],
    [
      "cyclic arrays remain ordinary values",
      "#a bind: [$Nil]. $a at: 0 put: $a. (($a at: 0) at: 0) length print.",
      "1\n",
    ],
    [
      "array elements use method lexical scope",
      "#p bind: $Object clone. $p at: 'name' put: 'parent'. $p at: 'values' put: { [$self name] }. #c bind: $p clone. $c at: 'name' put: 'child'. ($c values at: 0) print.",
      "child\n",
    ],
  ] as const
) {
  Deno.test(`array semantics: ${name}`, async () => {
    const result = await execute(source);

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

Deno.test("element errors stop before later effects and keep source position", async () => {
  const source = "[\n  1 print,\n  $missing,\n  3 print\n].";

  const result = await execute(source);

  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "1\n");
  assert.ok(
    text(result.stderr).includes(
      'fixture.toss:3:3: RuntimeError: Unbound name "missing".',
    ),
    text(result.stderr),
  );
});

for (const index of ["$Nil", "$True", "#key", "[]"] as const) {
  for (const write of [false, true] as const) {
    Deno.test(`array ${write ? "write" : "read"} rejects index ${index}`, async () => {
      const source = `[1] at: ${index}${write ? " put: 2" : ""}.`;

      const result = await execute(source);

      assert.notEqual(result.code, 0);
      assert.equal(text(result.stdout), "");
      assert.ok(
        text(result.stderr).includes(
          "RuntimeError: Array index must be a nonnegative safe integer.",
        ),
        text(result.stderr),
      );
    });
  }
}

for (const write of [false, true] as const) {
  Deno.test(`empty array rejects index zero on ${write ? "write" : "read"}`, async () => {
    const source = `[] at: 0${write ? " put: 2" : ""}.`;

    const result = await execute(source);

    assert.notEqual(result.code, 0);
    assert.ok(
      text(result.stderr).includes(
        "RuntimeError: Array index is out of bounds.",
      ),
      text(result.stderr),
    );
  });
}
