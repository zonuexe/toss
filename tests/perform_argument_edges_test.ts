import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const successes = [
  [
    "receiver selector and list evaluate once in order",
    "#o bind: ($Object clone |> %extend((#run): { a,b -> [$a,$b] })). #receiver bind: { 'receiver' print. $o }. #key bind: { 'key' print. #run }. #args bind: { 'list' print. ['first' print,'second' print] }. (($receiver value) perform: $key value withArguments: $args value) dump.",
    'receiver\nkey\nlist\nfirst\nsecond\n["first", "second"]\n',
  ],
  [
    "changing argument array during method keeps passed arguments",
    "#args bind: [1,2]. #o bind: ($Object clone |> %extend((#run): { a,b -> $args at: 1 put: 99. [$a,$b] })). ($o perform: #run withArguments: $args) dump. $args dump.",
    "[1, 2]\n[1, 99]\n",
  ],
  [
    "argument elements retain object identity",
    "#value bind: $Object clone. #args bind: [$value]. #o bind: ($Object clone |> %extend((#set): { obj -> $obj at: 'name' put: 'changed' })). $o perform: #set withArguments: $args. $value name print. ($args at: 0) name print.",
    "changed\nchanged\n",
  ],
  [
    "inherited slot arity overrides unary prelude arity",
    "#p bind: $Object clone. #c bind: $p clone. $p at: 'clone' put: { x -> $self name print. $x }. $c at: 'name' put: 'child'. ($c perform: 'clone' withArguments: [7]) print.",
    "child\n7\n",
  ],
  [
    "dynamic call can select dynamic prelude recursively",
    "#o bind: ($Object clone |> %extend((#sum): { a,b -> $a add: $b })). ($o perform: 'perform:withArguments:' withArguments: [#sum,[2,3]]) print.",
    "5\n",
  ],
  [
    "empty list returns Nil slot without treating it as missing",
    "#o bind: ($Object clone |> %extend((#empty): $Nil)). ($o perform: #empty withArguments: []) dump.",
    "nil\n",
  ],
  [
    "method result keeps object identity",
    "#value bind: $Object clone. #o bind: ($Object clone |> %extend((#identity): { x -> $x })). ($o perform: #identity withArguments: [$value]) at: 'result' put: 42. $value result print.",
    "42\n",
  ],
  [
    "ordinary slot overrides the dynamic prelude including validation",
    "#o bind: ($Object clone |> %extend('perform:withArguments:': { key,args -> $key print. $args })). ($o perform: 1 withArguments: 'raw') print.",
    "1\nraw\n",
  ],
] as const;

for (const [name, source, output] of successes) {
  Deno.test(`perform arguments edge: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

Deno.test("dynamic selector validation follows argument expression effects", async () => {
  const result = await execute(
    "$Object perform: 1 withArguments: ({ 'list' print. [] } value). 'after' print.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "list\n");
  assert.match(text(result.stderr), /Object key must be a string or symbol/);
});

Deno.test("failed argument expression stops before method execution", async () => {
  const result = await execute(
    "#o bind: ($Object clone |> %extend((#run): { x -> 'wrong' print })).\n$o perform: #run withArguments: [$missing].\n'after' print.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(text(result.stderr), /fixture\.toss:2:34: RuntimeError:/);
});

for (const value of ["$Nil", "'text'", "{ [] }", "1", "$True"]) {
  Deno.test(`dynamic argument list must be an Array: ${value}`, async () => {
    const result = await execute(
      `$Object perform: 'clone' withArguments: ${value}.`,
    );
    assert.notEqual(result.code, 0);
    assert.match(text(result.stderr), /Arguments must be an Array/);
  });
}

for (const receiver of ["[]", "{}", "1", "'text'", "$True", "$Nil", "#name"]) {
  Deno.test(`argument-bearing dynamic send is Object-only: ${receiver}`, async () => {
    const result = await execute(
      `${receiver} perform: 'inspect' withArguments: [].`,
    );
    assert.notEqual(result.code, 0);
    assert.match(
      text(result.stderr),
      /Unknown message "perform:withArguments:"/,
    );
  });
}
