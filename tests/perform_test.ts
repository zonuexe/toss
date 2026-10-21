import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const successes = [
  [
    "string and symbol selectors stay distinct",
    "#o bind: $Object clone. $o at: 'same' put: 'string'. $o at: #same put: { $self at: 'same' }. ($o perform: #same) print.",
    "string\n",
  ],
  [
    "inherited symbol method receives child",
    "#p bind: $Object clone. $p at: #read put: { $self name }. #c bind: $p clone. $c at: 'name' put: 'child'. ($c perform: #read) print.",
    "child\n",
  ],
  [
    "prelude fallback and data slots",
    "#o bind: $Object clone. #c bind: ($o perform: 'clone'). $c at: 'v' put: 3. ($c perform: 'v') print.",
    "3\n",
  ],
  [
    "arbitrary string key and nil slot",
    "#o bind: $Object clone. $o at: '' put: $Nil. ($o perform: '') print.",
    "nil\n",
  ],
  [
    "custom colon block takes priority over keyword prelude",
    "#o bind: $Object clone. $o at: 'at:' put: { 'custom' }. ($o perform: 'at:') print.",
    "custom\n",
  ],
] as const;

for (const [name, source, output] of successes) {
  Deno.test(`perform: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
  });
}

const failures = [
  [
    "wrong key type",
    "#o bind: $Object clone. $o perform: 1.",
    "Object key must be a string or symbol.",
  ],
  [
    "missing symbol has no fallback",
    "#o bind: $Object clone. $o perform: #clone.",
    "Unknown message #clone for Object.",
  ],
  [
    "keyword prelude needs arguments",
    "#o bind: $Object clone. $o perform: 'at:'.",
    'Message "at:" requires arguments.',
  ],
  [
    "perform itself needs its key",
    "#o bind: $Object clone. $o perform: 'perform:'.",
    'Message "perform:" requires arguments.',
  ],
  [
    "zero argument arity is checked",
    "#o bind: $Object clone. $o at: 'm' put: { x -> $x }. $o perform: 'm'.",
    "Block expects 1 argument(s), received 0.",
  ],
  [
    "unsupported receiver",
    "1 perform: 'toString'.",
    'Unknown message "perform:" for Number.',
  ],
] as const;

for (const [name, source, reason] of failures) {
  Deno.test(`perform: ${name}`, async () => {
    const result = await execute(source);
    assert.notEqual(result.code, 0);
    assert.ok(
      text(result.stderr).includes(`RuntimeError: ${reason}`),
      text(result.stderr),
    );
  });
}

Deno.test("perform errors point to the send", async () => {
  const callError = await execute(
    "#o bind: $Object clone.\n$o perform: 'missing'.",
  );
  assert.notEqual(callError.code, 0);
  assert.ok(
    text(callError.stderr).includes("fixture.toss:2:4"),
    text(callError.stderr),
  );
});

Deno.test("perform method body errors keep their location", async () => {
  const bodyError = await execute(
    "#o bind: $Object clone.\n$o at: 'm' put: {\n  $absent\n}.\n$o perform: 'm'.",
  );
  assert.notEqual(bodyError.code, 0);
  assert.ok(
    text(bodyError.stderr).includes("fixture.toss:3:3"),
    text(bodyError.stderr),
  );
});

Deno.test("receiver and selector expressions each run once", async () => {
  const result = await execute(
    "#count bind: $Object clone. $count at: 'n' put: 0. #o bind: $Object clone. $o at: 'value' put: 9. #receiver bind: { $count at: 'n' put: (($count at: 'n') add: 1). $o }. #selector bind: { $count at: 'n' put: (($count at: 'n') add: 1). 'value' }. (($receiver value) perform: ($selector value)) print. ($count at: 'n') print.",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "9\n2\n");
});

Deno.test("selector errors short circuit dispatch", async () => {
  const result = await execute(
    "#o bind: $Object clone. $o at: 'm' put: { 'ran' print }. $o perform: $absent.",
  );
  assert.notEqual(result.code, 0);
  assert.ok(
    text(result.stderr).includes('RuntimeError: Unbound name "absent".'),
    text(result.stderr),
  );
  assert.ok(!text(result.stdout).includes("ran"), text(result.stdout));
});
