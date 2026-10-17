import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { execute, executeJavaScript, text } from "./helpers.ts";

const cases = [
  [
    "mutual cycles render only the active occurrence",
    "#a bind: [0]. #b bind: [$a]. $a at: 0 put: $b. [$a, $b] dump.",
    "[[[[...]]], [[[...]]]]\n",
  ],
  [
    "each occurrence is inspected once from left to right",
    "#o bind: $Object clone. $o at: 'n' put: 0. $o at: 'inspect' put: { $self at: 'n' put: ($self n add: 1). $self n print. $self n toString }. [$o, $o] dump.",
    "1\n2\n[1, 2]\n",
  ],
  [
    "a slot snapshot retains replaced values and live nested references",
    "#o bind: $Object clone. #nested bind: [2]. #a bind: [$o, 3, $nested]. $o at: 'inspect' put: { $a at: 1 put: 99. $nested at: 0 put: 8. 'item' }. $a dump. ($a at: 1) print.",
    "[item, 3, [8]]\n99\n",
  ],
  [
    "print returns the original array",
    "#a bind: [1]. ($a print) at: 0 put: 7. $a dump.",
    "[1]\n[7]\n",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`array display: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

for (const conversion of ["inspect", "toString", "print", "dump"] as const) {
  Deno.test(`array ${conversion} rejects an object without inspect`, async () => {
    const result = await execute(
      `'before' print.\n  [$Object clone] ${conversion}.`,
    );
    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "before\n");
    assert.match(
      text(result.stderr),
      /fixture\.toss:2:19: RuntimeError: Unknown message "inspect" for Object\./,
    );
  });
}

Deno.test("array display errors keep custom method body locations", async () => {
  const result = await execute(
    "#o bind: $Object clone.\n$o at: 'inspect' put: {\n  $missing\n}.\n[$o] dump.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(
    text(result.stderr),
    /fixture\.toss:3:3: RuntimeError: Unbound name "missing"\./,
  );
});

Deno.test("array display releases every active ancestor after an error", async () => {
  const setup = compile(
    "#nested bind: [$Object clone]. #outer bind: [$nested].",
    "fixture.toss",
  );
  // Catch at the JavaScript boundary; Toss error handling is not implemented.
  const result = await executeJavaScript(
    setup + `
const context = {environment, location: {file: "fixture.toss", line: 1, column: 1}};
const outer = fetchBinding("outer", context);
try {
  send(outer, {name: "inspect", arguments: []}, context);
} catch (error) {
  if (!(error instanceof TossRuntimeError)) throw error;
  console.log("caught");
}
fetchBinding("nested", context)[0] = 1;
console.log(send(outer, {name: "inspect", arguments: []}, context));
console.log(send(outer, {name: "inspect", arguments: []}, context));
`,
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "caught\n[[1]]\n[[1]]\n");
  assert.equal(text(result.stderr), "");
});
