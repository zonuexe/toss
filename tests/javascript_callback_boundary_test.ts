import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import { execute, text } from "./helpers.ts";
import { runModuleProgram } from "./module_helpers.ts";

Deno.test("JS callbacks keep escaped parent-call context despite a forged host this", async () => {
  const source = `#base bind: ($Object clone |> %extend(m: { $self name })).
#child bind: ($base clone |> %extend(name: 'lexical', m: { { %super() } asJSCallback })).
#callback bind: $child m.
%js(callback = $callback; callback.call({ kind: 'tossInvocation', context: { receiver: { name: 'host' }, key: 'm', owner: {} } })) print.`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "lexical\n");
});

Deno.test("JS callback conversion does not borrow the converting method's self", async () => {
  const source = `#self bind: 'root'.
#original bind: { $self }.
#object bind: ($Object clone |> %extend(name: 'method', make: { $original asJSCallback })).
#callback bind: $object make.
%js(callback = $callback; callback.call({ name: 'host' })) print.`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "root\n");
});

Deno.test("JS callbacks preserve introduced and caller scopes after macro expansion", async () => {
  const source = [
    "%macro(#capture, { syntax ->",
    "%`({ #private bind: 2. { (%,($syntax)) add: $private } asJSCallback } value)",
    "}).",
    "#callback bind: ({ private -> %capture($private) } value: 40).",
    "%js(callback = $callback; callback()) print.",
  ].join("\n");

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "42\n");
});

Deno.test("JS callbacks keep fresh locals under synchronous reentrant invocation", async () => {
  const source = `#state bind: $Object clone.
#callback bind: { n ->
  #saved bind: $n.
  ($n greaterThan: 0) ifTrue: { %js(state = $state; state.callback(0)) }.
  $saved
} asJSCallback.
%js(state = $state, callback = $callback; state.callback = callback).
%js(callback = $callback; callback(7)) print.`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "7\n");
});

Deno.test("JS callbacks exported from Toss modules retain private file bindings", async () => {
  const files = {
    "main.toss":
      "#private bind: 1. #callback bind: %import('./lib.toss'). %js(callback = $callback; callback(2)) print.",
    "lib.toss":
      "#private bind: 40. %export({ n -> $private add: $n } asJSCallback).",
  };

  const result = await runModuleProgram(files, "main.toss");

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "42\n");
});

Deno.test("ignored surplus callback arguments are discarded before JS conversion", async () => {
  const source =
    "%js(callback = { n -> $n add: 1 } asJSCallback; callback(6, 1n, Symbol('ignored'), Infinity)) print.";

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "7\n");
});

Deno.test("cached callback conversion reports missing arguments at its first conversion site", async () => {
  const source = `#block bind: { n -> 'must not run' print. $n }.
#first bind: $block asJSCallback.
#second bind: $block asJSCallback.
%js(callback = $second; callback()).`;

  const result = await execute(source);

  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(text(result.stderr), /fixture\.toss:2:/);
  assert.doesNotMatch(text(result.stderr), /fixture\.toss:3:/);
});

Deno.test("JS callback body failures preserve generated syntax provenance as the JS cause", async () => {
  const source = `%macro(#broken, { syntax -> %quote({ $absent }) }).
#callback bind: %broken() asJSCallback.
%js(callback = $callback; (() => {
  try { callback(); } catch (error) { console.log(error.message); }
})()).`;

  const result = await execute(source);

  assert.equal(result.code, 0, text(result.stderr));
  assert.match(text(result.stdout), /fixture\.toss:1:/);
  assert.match(text(result.stdout), /expanded broken/);
  assert.match(text(result.stdout), /fixture\.toss:2:/);
});

Deno.test("macro evaluation rejects host callback creation", () => {
  const source = "%macro(#host, { syntax -> {} asJSCallback }). %host().";

  const action = () => compile(source, "callback-macro.toss");

  assert.throws(action, TossSyntaxError);
});
