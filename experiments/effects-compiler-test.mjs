import assert from "node:assert/strict";
import { compileExperimentalEffects } from "./effects-compiler.ts";

async function execute(source) {
  const javascript = compileExperimentalEffects(source, "experimental.toss");
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["eval", javascript],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const decoder = new TextDecoder();
  return {
    success: result.success,
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
  };
}

const cases = [
  [
    "handler continues after resumption",
    "#h bind: $Object clone. $h at: #A put: { p, k -> ($k value: $p) add: 2 }. ({ ($Effect raise: #A with: 3) add: 1 } handleWith: $h) print.",
    "6\n",
  ],
  [
    "outer handler skips inner handler",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. #inner bind: $Object clone. $inner at: #B put: { p, k -> 0 }. ({ { $Effect raise: #A with: $Nil } handleWith: $inner } handleWith: $h) print.",
    "7\n",
  ],
  [
    "effect through dynamically selected method",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: ($p add: 2) }. #o bind: $Object clone. $o at: 'call:' put: { x -> $Effect raise: #A with: $x }. ({ $o call: 5 } handleWith: $h) print.",
    "7\n",
  ],
  [
    "pipeline keeps input before receiver",
    "'left' print |> #target print bind:. $target print.",
    "left\ntarget\nleft\n",
  ],
  [
    "effect inside extension key and value",
    "#h bind: $Object clone. $h at: #Key put: { p, k -> $k value: 'name' }. $h at: #Value put: { p, k -> $k value: 9 }. #o bind: ({ $Object clone |> %extend(($Effect raise: #Key with: $Nil): ($Effect raise: #Value with: $Nil)) } handleWith: $h). $o name print.",
    "9\n",
  ],
  [
    "effect inside conditional",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. ({ $True ifTrue: { $Effect raise: #A with: $Nil } ifFalse: { 99 } } handleWith: $h) print.",
    "7\n",
  ],
  [
    "effect inside repetition",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 7 }. ({ 2 times: { ($Effect raise: #A with: $Nil) print } } handleWith: $h).",
    "7\n7\n",
  ],
  [
    "effect inside filter",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: $True }. ({ [1, 2] filter: { x -> $Effect raise: #A with: $x } } handleWith: $h) length print.",
    "2\n",
  ],
  [
    "effect inside reduce",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: $p }. ({ [1, 2] reduce: 0 with: { acc, x -> $acc add: ($Effect raise: #A with: $x) } } handleWith: $h) print.",
    "3\n",
  ],
  [
    "extension custom setter can suspend",
    "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 8 }. #o bind: $Object clone. #sink bind: $Object clone. $o at: 'at:put:' put: { key, value -> $sink at: $key put: ($Effect raise: #A with: $value) }. { $o |> %extend(name: 4) } handleWith: $h. $sink name print.",
    "8\n",
  ],
  [
    "filter snapshots source",
    "#source bind: [1, 2]. #r bind: ($source filter: { x -> $source at: 1 put: 9. $True }). ($r at: 1) print.",
    "2\n",
  ],
  [
    "unchosen block arity is not checked",
    "($False ifTrue: { x -> $x }) print.",
    "nil\n",
  ],
  [
    "ensure returns protected value",
    "({ 'body' print. 7 } ensure: { 'cleanup' print }) print.",
    "body\ncleanup\n7\n",
  ],
  [
    "ensure on resumption",
    "#h bind: $Object clone. $h at: #A put: { p, k -> 'before' print. #result bind: ($k value: 1). 'after' print. $result }. ({ { $Effect raise: #A with: $Nil. 'body-end' print. 3 } ensure: { 'cleanup' print } } handleWith: $h) print.",
    "before\nbody-end\ncleanup\nafter\n3\n",
  ],
  [
    "ensure on abandonment",
    "#h bind: $Object clone. $h at: #A put: { p, k -> 'handler' print. 42 }. ({ { $Effect raise: #A with: $Nil. 'never' print } ensure: { 'cleanup' print } } handleWith: $h) print.",
    "handler\ncleanup\n42\n",
  ],
  [
    "outer handler resumes suspended inner case",
    "#outer bind: $Object clone. $outer at: #B put: { p, k -> $k value: 5 }. #inner bind: $Object clone. $inner at: #A put: { p, k -> #v bind: ($Effect raise: #B with: $Nil). $k value: $v }. ({ { $Effect raise: #A with: $Nil } handleWith: $inner } handleWith: $outer) print.",
    "5\n",
  ],
  [
    "same handler object has distinct installations",
    "#h bind: $Object clone. $h at: #A put: { p, k -> ($p equals: 1) ifTrue: { $Effect raise: #A with: 2 } ifFalse: { $k value: 9 } }. ({ { $Effect raise: #A with: 1 } handleWith: $h } handleWith: $h) print.",
    "9\n",
  ],
  ["ordinary Block", "({ n -> $n add: 1 } value: 4) print.", "5\n"],
  [
    "resumption through map",
    "#h bind: $Object clone. $h at: #Missing put: { p, k -> $k value: ($p add: 10) }. #r bind: ({ [1, 2] map: { x -> $Effect raise: #Missing with: $x } } handleWith: $h). ($r at: 0) print. ($r at: 1) print.",
    "11\n12\n",
  ],
  [
    "abandonment",
    "#h bind: $Object clone. $h at: #Missing put: { p, k -> 42 }. ({ $Effect raise: #Missing with: $Nil. 99 } handleWith: $h) print.",
    "42\n",
  ],
  [
    "inherited handler self",
    "#base bind: $Object clone. $base at: #Missing put: { p, k -> $k value: ($p add: $self bias) }. #h bind: $base clone. $h at: 'bias' put: 7. ({ $Effect raise: #Missing with: 3 } handleWith: $h) print.",
    "10\n",
  ],
  [
    "handler parent call",
    "#base bind: $Object clone. $base at: #Missing put: { p, k -> $k value: ($p add: $self bias) }. #h bind: $base clone. $h at: 'bias' put: 7. $h at: #Missing put: { p, k -> %super($p, $k) }. ({ $Effect raise: #Missing with: 3 } handleWith: $h) print.",
    "10\n",
  ],
];
for (const [name, source, expected] of cases) {
  const result = await execute(source);
  assert.equal(result.success, true, `${name}: ${result.stderr}`);
  assert.equal(result.stdout, expected, name);
}
for (
  const [name, source, error, expectedOutput] of [
    [
      "invalid filter result",
      "[1] filter: { x -> 1 }.",
      /Boolean result required/,
      "",
    ],
    [
      "conditional validates both branches",
      "$True ifTrue: { 'never' print } ifFalse: 1.",
      /Block argument required/,
      "",
    ],
    [
      "invalid extend target before entries",
      "1 |> %extend(name: 'never' print).",
      /%extend target must be an Object/,
      "",
    ],
  ]
) {
  const result = await execute(source);
  assert.equal(result.success, false, name);
  assert.match(result.stderr, error, name);
  assert.equal(result.stdout, expectedOutput, name);
}
for (
  const [name, source, primary, cleanup] of [
    [
      "body and cleanup failures",
      "{ $primary } ensure: { $cleanup }.",
      'Unbound name "primary"',
      'Unbound name "cleanup"',
    ],
    [
      "handler and cleanup failures",
      "#h bind: $Object clone. $h at: #A put: { p, k -> $primary }. { { $Effect raise: #A with: $Nil } ensure: { $cleanup } } handleWith: $h.",
      'Unbound name "primary"',
      'Unbound name "cleanup"',
    ],
  ]
) {
  const result = await execute(source);
  assert.equal(result.success, false, name);
  assert.ok(result.stderr.includes(primary), result.stderr);
  assert.ok(result.stderr.includes(cleanup), result.stderr);
  assert.ok(
    result.stderr.indexOf(primary) < result.stderr.indexOf(cleanup),
    result.stderr,
  );
}
const multipleCleanup = await execute(
  "{ { $primary } ensure: { $inner } } ensure: { $outer }.",
);
assert.equal(multipleCleanup.success, false);
const primaryIndex = multipleCleanup.stderr.indexOf('Unbound name "primary"');
const innerIndex = multipleCleanup.stderr.indexOf('Unbound name "inner"');
const outerIndex = multipleCleanup.stderr.indexOf('Unbound name "outer"');
assert.ok(
  primaryIndex >= 0 && primaryIndex < innerIndex && innerIndex < outerIndex,
  multipleCleanup.stderr,
);
const blockedCleanup = await execute(
  "{ 1 } ensure: { $Effect raise: #A with: $Nil }.",
);
assert.equal(blockedCleanup.success, false);
assert.match(blockedCleanup.stderr, /Effects are not allowed during cleanup/);
const invalidCleanup = await execute("{ 'never' print } ensure: { x -> $x }.");
assert.equal(invalidCleanup.success, false);
assert.equal(invalidCleanup.stdout, "");
assert.match(invalidCleanup.stderr, /Block expects 1 argument/);
const unhandled = await execute("$Effect raise: #Missing with: $Nil.");
assert.equal(unhandled.success, false);
assert.match(
  unhandled.stderr,
  /experimental\.toss:1:\d+: RuntimeError: Unhandled effect/,
);
for (
  const [name, source] of [
    [
      "repeated resume",
      "#h bind: $Object clone. $h at: #A put: { p, k -> $k value: 1. $k value: 2 }. { $Effect raise: #A with: $Nil } handleWith: $h.",
    ],
    [
      "expired resume",
      "#box bind: $Object clone. #h bind: $Object clone. $h at: #A put: { p, k -> $box at: 'saved' put: $k. 42 }. { $Effect raise: #A with: $Nil } handleWith: $h. ($box at: 'saved') value: 2.",
    ],
    [
      "suspended case resume",
      "#outer bind: $Object clone. $outer at: #B put: { p, k -> $p value: 9 }. #inner bind: $Object clone. $inner at: #A put: { p, k -> $Effect raise: #B with: $k }. { { $Effect raise: #A with: $Nil } handleWith: $inner } handleWith: $outer.",
    ],
  ]
) {
  const result = await execute(source);
  assert.equal(result.success, false, name);
  assert.match(result.stderr, /Invalid resume/, `${name}: ${result.stderr}`);
  if (name === "expired resume") {
    const column = source.lastIndexOf("value: 2") + 1;
    assert.match(
      result.stderr,
      new RegExp(
        `experimental\\.toss:1:${column}: RuntimeError: Invalid resume`,
      ),
    );
  }
}
const argumentsBeforeResumeValidation = await execute(
  "#box bind: $Object clone. #h bind: $Object clone. $h at: #A put: { p, k -> $box at: 'saved' put: $k. 42 }. { $Effect raise: #A with: $Nil } handleWith: $h. ($box at: 'saved') value: ('argument' print).",
);
assert.equal(argumentsBeforeResumeValidation.success, false);
assert.equal(argumentsBeforeResumeValidation.stdout, "argument\n");
assert.match(argumentsBeforeResumeValidation.stderr, /Invalid resume/);
assert.throws(
  () => compileExperimentalEffects("%async({ 1 }).", "experimental.toss"),
  /does not support async/,
);
console.log(
  `PASS: ${cases.length} experimental AST compiler scenarios, unhandled effect and async rejection`,
);
