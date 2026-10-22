import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, text } from "./helpers.ts";
import { runModuleProgram } from "./module_helpers.ts";

const valueCases = [
  [
    "Toss Array identity and messages survive an async return",
    "#original bind: [1, 2]. #value bind: %await((%async({ $original }) value)). $value at: 0 put: 7. $original dump.",
    "[7, 2]\n",
  ],
  [
    "Toss Blocks can be awaited without forcing an unsupported JS export",
    "#value bind: %await((%async({ { 42 } }) value)). $value value print.",
    "42\n",
  ],
  [
    "Toss Symbols keep identity across async results",
    "#key bind: $Symbol generateUnique. #value bind: %await((%async({ $key }) value)). ($value equals: $key) print.",
    "true\n",
  ],
  [
    "a native fulfilled Array keeps the JS reference boundary",
    "#value bind: %await(%js(Promise.resolve([7]))). $value inspect print. %js(value = $value; value[0]) print.",
    "<js>\n7\n",
  ],
] as const;

for (const [name, body, expected] of valueCases) {
  Deno.test(`async boundary: ${name}`, async () => {
    const source = `%async({ ${body} $Nil }) value.`;

    const result = await execute(source);

    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), expected);
  });
}

Deno.test("await never reads a plain Toss Object then getter", async () => {
  const source = `%async({
  #original bind: $Object clone.
  %js(object = $original; Object.defineProperty(object, 'then', { get() { throw new Error('must not read then'); } })).
  #direct bind: %await($original).
  #returned bind: %await((%async({ $original }) value)).
  %js(values = [$original, $direct, $returned]; values[0] === values[1] && values[0] === values[2]) print.
  $Nil
}) value.`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
});

Deno.test("await of an ordinary value suspends before the continuation", async () => {
  const source = `%async({ 'start' print. %await(42) print. $Nil }) value.
'outside' print.`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "start\noutside\n42\n");
});

Deno.test("pipeline awaits preserve input receiver and argument evaluation order", async () => {
  const source = `%async({
  (1 print |> (%await((%async({ 'receiver' print. { a,b -> $a add: $b } }) value))) value: %await((%async({ 'argument' print. 2 }) value)) value:) print.
  $Nil
}) value.`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "1\nreceiver\nargument\n3\n");
});

Deno.test("awaited extension keys and values keep sequential writes", async () => {
  const source = `%async({
  #object bind: $Object clone.
  $object |> %extend(
    (%await(%js(Promise.resolve('first')))): %await(%js(Promise.resolve(7))),
    'second': %await((%async({ $object first add: 1 }) value))
  ).
  $object first print. $object second print.
  $Nil
}) value.`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "7\n8\n");
});

Deno.test("concurrent async callbacks isolate locals and awaited extension targets", async () => {
  const source = `#callback bind: %async({ n ->
  #saved bind: $n.
  #object bind: $Object clone.
  $object |> %extend('value': %await((%async({ $saved }) value))).
  $object value
}) asJSCallback.
%js(callback = $callback; Promise.all([callback(11), callback(22)]).then(values => console.log(values.join(',')))).`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "11,22\n");
});

Deno.test("async parent calls keep lexical self across a wait and hostile host this", async () => {
  const source = `#base bind: ($Object clone |> %extend(m: { $self name })).
#child bind: ($base clone |> %extend(name: 'lexical', m: { %async({ %await(0). %super() }) asJSCallback })).
#callback bind: $child m.
%js(callback = $callback; callback.call({ kind: 'tossInvocation', context: { receiver: { name: 'host' } } }).then(value => console.log(value))).`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "lexical\n");
});

Deno.test("a macro can emit await for the enclosing async Block", async () => {
  const source = [
    "%macro(#wait, { syntax -> %`(%await(%,($syntax))) }).",
    "%async({ %wait(42) print. $Nil }) value.",
  ].join("\n");

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "42\n");
});

Deno.test("macro generated awaits in a nested ordinary Block are rejected at source", () => {
  const source = [
    "%macro(#wait, { syntax -> %`(%await(%,($syntax))) }).",
    "%async({ { %wait(42) } value }) value.",
  ].join("\n");

  const action = () => compile(source, "nested-await.toss");

  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof TossSyntaxError);
    assert.match(error.message, /nested-await\.toss:2:/);
    assert.match(error.message, /wait/);
    return true;
  });
});

Deno.test("async Block exports keep private module bindings after suspension", async () => {
  const files = {
    "main.toss":
      "#secret bind: 1. #block bind: %import('./lib.toss'). %js(callback = $block asJSCallback; callback(2).then(value => console.log(value))).",
    "lib.toss":
      "#secret bind: 40. %export(%async({ n -> %await(0). $secret add: $n })).",
  };

  const result = await runModuleProgram(files, "main.toss");

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "42\n");
});

Deno.test("an async result returned through JS still preserves its Toss Array on await", async () => {
  const source = `%async({
  #original bind: [1].
  #pending bind: (%async({ $original }) value).
  #roundTrip bind: %js(value = $pending; value).
  #returned bind: %await($roundTrip).
  $returned at: 0 put: 42.
  $original dump.
  $Nil
}) value.`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "[42]\n");
});

Deno.test("repeated waits preserve the same original Toss failure", async () => {
  const source = `#pending bind: (%async({ $missing }) value).
#waiter bind: %async({ %await($pending) }) asJSCallback.
%js(waiter = $waiter; Promise.all([
  waiter().catch(error => error), waiter().catch(error => error),
]).then(([first, second]) => console.log(first === second))).`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
});

Deno.test("async macro hygiene survives suspension and an escaping caller binding", async () => {
  const source = [
    "%macro(#later, { syntax -> %`(%async({ #private bind: 2. %await(0). (%,($syntax)) add: $private })) }).",
    "#block bind: ({ private -> %later($private) } value: 40).",
    "%js(callback = $block asJSCallback; callback().then(value => console.log(value))).",
  ].join("\n");

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "42\n");
});

Deno.test("async extension validates its target before awaited entry effects", async () => {
  const source = `#runner bind: %async({
  1 |> %extend((%await((%async({ 'must not run' print. 'key' }) value))): 7)
}) asJSCallback.
%js(runner = $runner; runner().catch(error => console.log(error.message.includes('%extend target')))).`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "true\n");
});
