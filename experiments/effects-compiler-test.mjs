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
