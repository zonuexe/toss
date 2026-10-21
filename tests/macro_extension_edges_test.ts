import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const cases = [
  [
    "values use caller bindings without a new Toss scope",
    "#o bind: $Object clone. #same bind: ($o |> %extend(first: #visible bind: 8, second: $visible)). $visible print. [$same first, $same second] dump.",
    "8\n[8, 8]\n",
  ],
  [
    "values retain caller self and methods receive target self",
    "#host bind: $Object clone. $host at: 'name' put: 'host'. $host at: 'make:' put: { target -> $target |> %extend(value: $self name, read: { $self name }) }. #o bind: $Object clone. $o at: 'name' put: 'target'. #r bind: ($host make: $o). $r value print. $r read print.",
    "host\ntarget\n",
  ],
  [
    "method closures survive subsequent extensions",
    "#one bind: ($Object clone |> %extend(name: 'one', reader: { { $self name } })). #read bind: $one reader. #two bind: ($Object clone |> %extend(name: 'two')). $read value print. $two name print.",
    "one\ntwo\n",
  ],
  [
    "temporary names do not capture user bindings",
    "#extendTarget bind: 1. #piped bind: 2. #scope bind: 3. #environment bind: 4. #o bind: ($Object clone |> %extend(values: [$extendTarget, $piped, $scope, $environment])). $o values dump. [$extendTarget, $piped, $scope, $environment] dump.",
    "[1, 2, 3, 4]\n[1, 2, 3, 4]\n",
  ],
  [
    "custom setters receive self and cannot change the returned target",
    "#sink bind: $Object clone. #o bind: $Object clone. $o at: 'name' put: 'target'. $o at: 'at:put:' put: { key, value -> $self name print. $sink at: $key put: $value. 'ignored' }. #r bind: ($o |> %extend(first: 1, second: 2)). $r name print. [$sink first, $sink second] dump.",
    "target\ntarget\ntarget\n[1, 2]\n",
  ],
  [
    "target and values run once with writes between values",
    "#o bind: $Object clone. #make bind: { 'target' print. $o }. #r bind: ($make value |> %extend(first: 'value' print, second: $o first, total: 1 add: 2, first: 'last')). [$r first, $r second, $r total] dump.",
    'target\nvalue\n["last", "value", 3]\n',
  ],
  [
    "empty extension returns the original object through another pipeline",
    "#o bind: $Object clone. $o |> %extend() |> #same bind:. $same at: 'value' put: 7. $o value print.",
    "7\n",
  ],
  [
    "prototype updates and safe string slots keep existing behavior",
    "#p bind: ($Object clone |> %extend(name: 'parent')). #c bind: ($p clone |> %extend(__proto__: 'data', constructor: 'slot', toString: { 'custom' })). $p at: 'name' put: 'updated'. $c name print. ($c at: '__proto__') print. $c constructor print. $c print.",
    "updated\ndata\nslot\ncustom\n",
  ],
  [
    "ordinary extend symbols coexist with the macro",
    "#extend bind: 'before'. #symbol bind: #extend. #o bind: ($Object clone |> %extend(name: 'object')). $extend print. $symbol inspect print. $o name print. 'piped' |> #extend bind:. $extend print.",
    "before\n#extend\nobject\npiped\n",
  ],
  [
    "nested macros and parameter commas keep their own delimiters",
    "#o bind: ($Object clone |> %extend(child: ($Object clone |> %extend(name: 'nested')), values: [$(1+2), 4], remainder: $(10 % 3), sum: { a,b -> $($a+$b) })). $o child name print. $o values dump. $o remainder print. (($o at: 'sum') value: 2 value: 3) print.",
    "nested\n[3, 4]\n1\n5\n",
  ],
] as const;

for (const [name, source, output] of cases) {
  Deno.test(`extend macro: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}
