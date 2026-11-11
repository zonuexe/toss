import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { compileExperimentalEffects } from "./effects-compiler.ts";

async function execute(javascript) {
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
    "Block lexical binding",
    "#f bind: { x -> { $x } }. #a bind: ($f value: 7). ($a value) print.",
  ],
  [
    "message receiver and argument order",
    "#f bind: { 'receiver' print. { x -> $x } }. (($f value) value: ('argument' print)) print.",
  ],
  ["pipeline order", "'left' print |> #target print bind:. $target print."],
  [
    "map callback order",
    "#r bind: ([1, 2, 3] map: { x -> $x print. $x multiplyBy: 2 }). ($r at: 1) print.",
  ],
  [
    "filter snapshot",
    "#s bind: [1, 2]. #r bind: ($s filter: { x -> $s at: 1 put: 9. $True }). ($r at: 1) print.",
  ],
  [
    "reduce order",
    "([1, 2, 3] reduce: 0 with: { acc, x -> $x print. $acc add: $x }) print.",
  ],
  [
    "branch and skipped arity",
    "($False ifTrue: { x -> $x }) print. ($True ifTrue: { 7 } ifFalse: { 8 }) print.",
  ],
  ["repeat", "(2 times: { 'iteration' print. 8 }) print."],
  [
    "inherited method and self",
    "#p bind: $Object clone. $p at: 'run' put: { $self name }. #c bind: $p clone. $c at: 'name' put: 'child'. ($c run) print.",
  ],
  [
    "parent call",
    "#p bind: $Object clone. $p at: 'score:' put: { x -> $x add: $self base }. #c bind: $p clone. $c at: 'base' put: 5. $c at: 'score:' put: { x -> %super($x) add: 2 }. ($c score: 3) print.",
  ],
  [
    "dynamic extension order",
    "#o bind: $Object clone. #key bind: { 'key' print. 'first' }. #value bind: { 'value' print. $o first }. $o |> %extend(($key value): ('written' print), ({ 'second' print. 'second' } value): $value value). ($o at: 'first') print.",
  ],
  [
    "parent value slot",
    "#p bind: $Object clone. $p at: 'answer' put: 7. #c bind: $p clone. $c at: 'answer' put: { %super() }. ($c answer) print.",
  ],
  [
    "parent non-callable with argument",
    "#p bind: $Object clone. $p at: 'answer:' put: 7. #c bind: $p clone. $c at: 'answer:' put: { x -> %super($x) }. $c answer: 1.",
  ],
  [
    "parent prelude clone",
    "#o bind: $Object clone. $o at: 'clone' put: { %super() }. #c bind: ($o clone). $c at: 'value' put: 7. $c value print.",
  ],
  [
    "dynamic inherited method",
    "#p bind: $Object clone. $p at: #work put: { $self value }. #c bind: $p clone. $c at: 'value' put: 7. ($c perform: #work) print.",
  ],
  [
    "dynamic method with arguments",
    "#o bind: $Object clone. $o at: #sum put: { a, b -> $a add: $b }. ($o perform: #sum withArguments: [2, 3]) print.",
  ],
  ["dynamic missing Symbol", "#o bind: $Object clone. $o perform: #missing."],
  [
    "dynamic prelude missing arguments",
    "#o bind: $Object clone. $o perform: 'at:'.",
  ],
  [
    "dynamic invalid selector",
    "#o bind: $Object clone. $o perform: 1 withArguments: [].",
  ],
  [
    "dynamic invalid argument Array",
    "#o bind: $Object clone. $o perform: #x withArguments: 1.",
  ],
  ["JS expression bindings", "#x bind: 2. (%js(n = $x; n + 1)) print."],
  [
    "JS callback and identity",
    "#cb bind: { n -> $n add: 1 } asJSCallback. (%js(a = $cb, b = $cb; a === b && a(4) === 5)) print.",
  ],
  [
    "JS callback conversion error",
    "#cb bind: { x -> $x } asJSCallback. %js(f = $cb; f()).",
  ],
  [
    "async wait order",
    "#f bind: %async({ 'before' print. %await(1). 'after' print }). $f value. 'outside' print.",
  ],
  [
    "async JS callback",
    "#f bind: %async({ %await(%js(Promise.resolve(5))) }) asJSCallback. %js(f = $f; f().then(v => console.log(v))).",
  ],
  [
    "static JavaScript module",
    "#path bind: %jsImport('node:path'). (%js(p = $path; p.basename('/a/b'))) print.",
  ],
  ["invalid Block arity", "{ x -> $x } value."],
  ["invalid filter result", "[1] filter: { x -> 1 }."],
  ["invalid conditional branch", "$True ifTrue: { 'never' print } ifFalse: 1."],
  ["invalid array index", "([1] at: 2) print."],
  ["invalid extension target", "1 |> %extend(name: 'never' print)."],
  ["division by zero", "(1 divideBy: 0) print."],
];
function diagnostic(stderr) {
  return stderr.match(/conformance\.toss:\d+:\d+: RuntimeError: [^\n]+/)?.[0];
}
for (const [name, source] of cases) {
  const baseline = await execute(compile(source, "conformance.toss"));
  const experimental = await execute(
    compileExperimentalEffects(source, "conformance.toss"),
  );
  assert.equal(experimental.success, baseline.success, name);
  assert.equal(experimental.stdout, baseline.stdout, name);
  if (!baseline.success) {
    assert.ok(
      diagnostic(baseline.stderr),
      `${name}: missing baseline diagnostic: ${baseline.stderr}`,
    );
    assert.equal(
      diagnostic(experimental.stderr),
      diagnostic(baseline.stderr),
      name,
    );
  }
}
console.log(
  `PASS: ${cases.length} supported ordinary Toss programs match the standard compiler`,
);
