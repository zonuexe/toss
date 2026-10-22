import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  [
    "explicit adapters convert primitive arguments and returns",
    "#add bind: { value -> $value add: 2 } asJSCallback. %js(callback = $add; callback(5)) print.",
    "7\n",
  ],
  [
    "undefined is a present argument and becomes Nil",
    "#isNil bind: { value -> $value toString } asJSCallback. %js(callback = $isNil; callback(undefined)) print.",
    "nil\n",
  ],
  [
    "Nil returns JavaScript null",
    "#nil bind: { $Nil } asJSCallback. %js(callback = $nil; callback() === null) print.",
    "true\n",
  ],
  [
    "JavaScript references pass through with original identity",
    "#echo bind: { value -> $value } asJSCallback. %js(value = %js({}), callback = $echo; callback(value) === value) print.",
    "true\n",
  ],
  [
    "Promise references return synchronously with original identity",
    "#promise bind: %js(Promise.resolve(7)). #get bind: { $promise } asJSCallback. %js(value = $promise, callback = $get; callback() === value) print.",
    "true\n",
  ],
  [
    "Response references return with original identity",
    "#response bind: %js(new Response('ok')). #get bind: { $response } asJSCallback. %js(value = $response, callback = $get; callback() === value) print.",
    "true\n",
  ],
  [
    "surplus host arguments are ignored before conversion",
    "#first bind: { value -> $value } asJSCallback. %js(callback = $first; callback(9, 1n)) print.",
    "9\n",
  ],
  [
    "repeated conversion preserves native and Toss reference identity",
    "#block bind: { value -> $value }. #first bind: $block asJSCallback. #second bind: $block asJSCallback. %js(first = $first, second = $second; first === second) print.",
    "true\n",
  ],
  [
    "different Blocks receive different native functions",
    "#first bind: { 1 } asJSCallback. #second bind: { 1 } asJSCallback. %js(first = $first, second = $second; first !== second) print.",
    "true\n",
  ],
  [
    "a delayed callback retains a returned closure and gets fresh locals",
    "#make bind: { captured -> { value -> $captured add: $value } asJSCallback }. #callback bind: ($make value: 10). %js(callback = $callback; callback(1) + callback(2)) print.",
    "23\n",
  ],
  [
    "host this is ignored while lexical self is retained",
    "#host bind: ($Object clone |> %extend(name: 'lexical', make: { { $self } asJSCallback })). #callback bind: $host make. %js(callback = $callback, host = $host; callback.call({name: 'host'}) === host) print.",
    "true\n",
  ],
  [
    "ordinary Blocks are still rejected by JavaScript expressions",
    "%js(callback = { 1 }; callback).",
    "",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`JavaScript callback: ${name}`, async () => {
    const result = await execute(source);
    if (
      name === "ordinary Blocks are still rejected by JavaScript expressions"
    ) {
      assert.notEqual(result.code, 0);
      assert.match(
        text(result.stderr),
        /Toss Blocks cannot be passed directly to JavaScript\./,
      );
      return;
    }
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

Deno.test("ordinary Toss Block calls keep exact arity", async () => {
  const result = await execute("({ value -> $value } value: 1 value: 2).");
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /Block expects 1 argument\(s\), received 2\./,
  );
});
