import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const successes = [
  [
    "same-named string and symbol methods stay separate",
    "#o bind: ($Object clone |> #extend(same: { 'string' }, (#same): { 'symbol' })). ($o perform: 'same') print. ($o perform: #same) print.",
    "string\nsymbol\n",
  ],
  [
    "receiver and key run once in that order",
    "#o bind: ($Object clone |> #extend((#run): { 'result' })). #receiver bind: { 'receiver' print. $o }. #key bind: { 'key' print. #run }. (($receiver value) perform: $key value) print.",
    "receiver\nkey\nresult\n",
  ],
  [
    "prelude clone preserves delegation and returns a new object",
    "#p bind: ($Object clone |> #extend(name: 'parent')). #c bind: ($p perform: 'clone'). $c at: 'name' put: 'child'. $c name print. $p name print.",
    "child\nparent\n",
  ],
  [
    "print fallback converts and returns the original receiver",
    "#o bind: ($Object clone |> #extend(name: 'original', toString: { 'shown' })). ($o perform: 'print') name print.",
    "shown\noriginal\n",
  ],
  [
    "symbol method retains lexical bindings and returns a closure with self",
    "#make bind: { #label bind: 'lexical'. $Object clone |> #extend(name: 'receiver', (#reader): { { $label print. $self name } }) }. #o bind: $make value. #label bind: 'caller'. #later bind: ($o perform: #reader). $later value print.",
    "lexical\nreceiver\n",
  ],
  [
    "symbol data returns an object alias",
    "#value bind: $Object clone. #o bind: ($Object clone |> #extend((#data): $value)). ($o perform: #data) at: 'changed' put: 7. $value changed print.",
    "7\n",
  ],
  [
    "method result block is returned without another invocation",
    "#o bind: ($Object clone |> #extend((#make): { { 'later' } })). #b bind: ($o perform: #make). 'before' print. $b value print.",
    "before\nlater\n",
  ],
  [
    "unusual string keys invoke methods",
    "#o bind: ($Object clone |> #extend('': { 'empty' }, 'a b': { 'space' }, '日本語': { 'unicode' }, 'odd:': { 'colon' })). ($o perform: '') print. ($o perform: 'a b') print. ($o perform: '日本語') print. ($o perform: 'odd:') print.",
    "empty\nspace\nunicode\ncolon\n",
  ],
  [
    "inherited keyword-named data beats prelude guard",
    "#p bind: ($Object clone |> #extend('at:put:': $Nil)). #c bind: $p clone. ($c perform: 'at:put:') dump.",
    "nil\n",
  ],
  [
    "ordinary perform slot can override the prelude",
    "#o bind: ($Object clone |> #extend('perform:': { key -> $key })). ($o perform: #custom) dump.",
    "#custom\n",
  ],
] as const;

for (const [name, source, output] of successes) {
  Deno.test(`perform edge: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

const failures = [
  [
    "missing symbol does not select same-named string slot",
    "#o bind: ($Object clone |> #extend(run: { 'wrong' print })). $o perform: #run. 'after' print.",
    "Unknown message #run for Object.",
  ],
  [
    "missing string does not select same-named symbol slot",
    "#o bind: ($Object clone |> #extend((#run): { 'wrong' print })). $o perform: 'run'. 'after' print.",
    'Unknown message "run" for Object.',
  ],
  [
    "setter prelude cannot run without arguments",
    "$Object perform: 'at:put:'. 'after' print.",
    'Message "at:put:" requires arguments.',
  ],
] as const;

for (const [name, source, reason] of failures) {
  Deno.test(`perform edge: ${name}`, async () => {
    const result = await execute(source);
    assert.notEqual(result.code, 0);
    assert.equal(text(result.stdout), "");
    assert.ok(text(result.stderr).includes(reason), text(result.stderr));
  });
}
