import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const successes = [
  [
    "string and symbol methods receive arguments in order",
    "#o bind: ($Object clone |> %extend(join: { a, b -> $a print. $b })). ($o perform: 'join' withArguments: ['first', 'second']) print. ($o at: #join put: { left, right -> $right }). ($o perform: #join withArguments: [1, 2]) print.",
    "first\nsecond\n2\n",
  ],
  [
    "inherited methods receive child self and arbitrary keys ignore colons",
    "#p bind: ($Object clone |> %extend('odd key:': { x, y, z -> $self name })). #c bind: ($p clone |> %extend(name: 'child')). ($c perform: 'odd key:' withArguments: [1, 2, 3]) print.",
    "child\n",
  ],
  [
    "zero arguments return data and invoke zero arity methods",
    "#o bind: ($Object clone |> %extend(data: 7, run: { 'ran' })). ($o perform: 'data' withArguments: []) print. ($o perform: 'run' withArguments: []) print.",
    "7\nran\n",
  ],
  [
    "prelude setter getter and clone dispatch normally",
    "#o bind: $Object clone. $o perform: 'at:put:' withArguments: ['value', 9]. ($o perform: 'at:' withArguments: ['value']) print. #c bind: ($o perform: 'clone' withArguments: []). $c at: 'value' put: 10. ($o at: 'value') print.",
    "9\n9\n",
  ],
  [
    "overridden perform and prelude slots take precedence",
    "#o bind: ($Object clone |> %extend('perform:': { key -> $key }, 'clone': 'custom')). ($o perform: 'perform:' withArguments: [#ok]) dump. ($o perform: 'clone' withArguments: []) print.",
    "#ok\ncustom\n",
  ],
  [
    "selected result identity is preserved",
    "#v bind: $Object clone. #o bind: ($Object clone |> %extend(get: { $v })). #r bind: ($o perform: 'get' withArguments: []). $r at: 'same' put: $True. ($v at: 'same') print.",
    "true\n",
  ],
  [
    "ordinary argument expressions run once left to right",
    "#log bind: $Object clone. $log at: 'n' put: 0. #next bind: { $log at: 'n' put: (($log at: 'n') add: 1). $log at: 'n' }. #o bind: ($Object clone |> %extend(sum: { a, b -> $a add: $b })). ($o perform: 'sum' withArguments: [$next value, $next value]) print. ($log at: 'n') print.",
    "3\n2\n",
  ],
] as const;

for (const [name, source, output] of successes) {
  Deno.test(`perform:withArguments: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

const failures = [
  [
    "invalid selector",
    "1 withArguments: []",
    "Object key must be a string or symbol.",
  ],
  [
    "invalid arguments",
    "'run' withArguments: $Object",
    "Arguments must be an Array.",
  ],
  [
    "missing string",
    "'missing' withArguments: []",
    'Unknown message "missing" for Object.',
  ],
  [
    "missing symbol has no fallback",
    "#clone withArguments: []",
    "Unknown message #clone for Object.",
  ],
  [
    "block under arity",
    "'two' withArguments: [1]",
    "Block expects 2 argument(s), received 1.",
  ],
  [
    "block over arity",
    "'one' withArguments: [1, 2]",
    "Block expects 1 argument(s), received 2.",
  ],
  [
    "prelude under arity",
    "'at:put:' withArguments: ['x']",
    'Message "at:put:" expects 2 argument(s), received 1.',
  ],
  [
    "prelude over arity",
    "'at:' withArguments: ['x', 1]",
    'Message "at:" expects 1 argument(s), received 2.',
  ],
  [
    "noncallable slot with arguments",
    "'data' withArguments: [1]",
    'Object slot "data" is not callable.',
  ],
] as const;

for (const [name, invocation, reason] of failures) {
  Deno.test(`perform:withArguments: ${name}`, async () => {
    const source =
      `#o bind: ($Object clone |> %extend(one: { x -> $x }, two: { x, y -> $x }, data: 4)). $o perform: ${invocation}. 'after' print.`;
    const result = await execute(source);
    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "");
    assert.ok(
      text(result.stderr).includes(`RuntimeError: ${reason}`),
      text(result.stderr),
    );
  });
}

Deno.test("perform:withArguments: errors point to dynamic call", async () => {
  const call = await execute(
    "#o bind: $Object clone.\n$o perform: 'missing' withArguments: [].",
  );
  assert.notEqual(call.code, 0);
  assert.ok(text(call.stderr).includes("fixture.toss:2:4"), text(call.stderr));
});

Deno.test("perform:withArguments: body errors keep their source location", async () => {
  const body = await execute(
    "#o bind: ($Object clone |> %extend(run: { x ->\n  $absent\n})).\n$o perform: 'run' withArguments: [1].",
  );
  assert.notEqual(body.code, 0);
  assert.ok(text(body.stderr).includes("fixture.toss:2:3"), text(body.stderr));
});
