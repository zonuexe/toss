import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const successes = [
  [
    "explicit zero arguments and three-level owner lookup",
    "#a bind: $Object clone. $a at: 'm' put: { 'A' }. #b bind: $a clone. $b at: 'm' put: { 'B' print. %super() }. #c bind: $b clone. $c m print.",
    "B\nA\n",
  ],
  [
    "explicit arguments without forwarding",
    "#a bind: $Object clone. $a at: 'm:' put: { x -> $x }. #b bind: $a clone. $b at: 'm:' put: { x -> %super('explicit') }. ($b m: 'ignored') print.",
    "explicit\n",
  ],
  [
    "multiple parent steps update owner",
    "#a bind: $Object clone. $a at: 'm' put: { 'A' }. #b bind: $a clone. $b at: 'm' put: { 'B' print. %super() }. #c bind: $b clone. $c at: 'm' put: { 'C' print. %super() }. $c m print.",
    "C\nB\nA\n",
  ],
  [
    "same unique symbol selector",
    "#k bind: $Symbol generateUnique. #a bind: $Object clone. $a at: $k put: { 'A' }. #b bind: $a clone. $b at: $k put: { %super() }. ($b perform: $k) print.",
    "A\n",
  ],
  [
    "data and nil parent slots",
    "#a bind: $Object clone. $a at: 'data' put: $Nil. #b bind: $a clone. $b at: 'data' put: { %super() }. $b data print.",
    "nil\n",
  ],
  [
    "live lookup after argument mutation",
    "#a bind: $Object clone. $a at: 'm:' put: { x -> 'old' }. #b bind: $a clone. $b at: 'm:' put: { x -> %super(($a at: 'm:' put: { y -> 'new' })) }. ($b m: 0) print.",
    "new\n",
  ],
  [
    "escaped closure retains lexical parent context",
    "#a bind: $Object clone. $a at: 'm' put: { 'A' }. #b bind: $a clone. $b at: 'm' put: { { %super() } }. #saved bind: $b m. $saved value print.",
    "A\n",
  ],
  [
    "shared method block uses each selected slot owner",
    "#a bind: ($Object clone |> %extend(m: { 'A' })). #x bind: ($Object clone |> %extend(m: { 'X' })). #shared bind: { %super() }. #b bind: ($a clone |> %extend(m: $shared)). #d bind: ($x clone |> %extend(m: $shared)). $b m print. $d m print.",
    "A\nX\n",
  ],
  [
    "self shadowing does not change parent receiver",
    "#a bind: $Object clone. $a at: 'm:' put: { $self name }. #b bind: ($a clone |> %extend(name: 'child', 'm:': { self -> %super() })). ($b m: 'shadow') print.",
    "child\n",
  ],
] as const;

for (const [name, source, output] of successes) {
  Deno.test(`%super: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), output);
    assert.equal(text(result.stderr), "");
  });
}

const failures = [
  [
    "missing context",
    "%super().",
    "%super requires a method invocation context.",
  ],
  [
    "missing parent",
    "#o bind: ($Object clone |> %extend(m: { %super() })). $o m.",
    'Unknown parent message "m".',
  ],
  [
    "noncallable parent",
    "#a bind: $Object clone. $a at: 'm' put: 2. #b bind: ($a clone |> %extend(m: { %super(1) })). $b m.",
    'Object slot "m" is not callable.',
  ],
  [
    "prelude arity",
    "#a bind: $Object clone. #b bind: ($a clone |> %extend(clone: { %super(1) })). $b clone.",
    'Message "clone" expects 0 argument(s), received 1.',
  ],
] as const;

for (const [name, source, reason] of failures) {
  Deno.test(`%super: ${name} errors at the call`, async () => {
    const result = await execute(source);
    assert.notEqual(result.code, 0);
    assert.ok(
      text(result.stderr).includes(`RuntimeError: ${reason}`),
      text(result.stderr),
    );
  });
}

Deno.test("%super evaluates arguments before context validation", async () => {
  const result = await execute("%super('before' print). ");
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "before\n");
  assert.match(text(result.stderr), /RuntimeError: %super requires/);
});

Deno.test("ordinary callback does not borrow its caller's parent context", async () => {
  const result = await execute(
    "#callback bind: { %super() }. #o bind: ($Object clone |> %extend(m: { $callback value })). $o m.",
  );
  assert.notEqual(result.code, 0);
  assert.match(
    text(result.stderr),
    /RuntimeError: %super requires a method invocation context/,
  );
});

Deno.test("failing parent argument stops later arguments and lookup", async () => {
  const result = await execute(
    "#o bind: ($Object clone |> %extend(m: { %super($missing, 'later' print) })). $o m.",
  );
  assert.notEqual(result.code, 0);
  assert.equal(text(result.stdout), "");
  assert.match(text(result.stderr), /Unbound name "missing"/);
});

Deno.test("parent call errors point to percent", async () => {
  const missing = await execute(
    "#o bind: ($Object clone |> %extend(m: {\n  %super()\n})).\n$o m.",
  );
  assert.notEqual(missing.code, 0);
  assert.match(text(missing.stderr), /fixture\.toss:2:3: RuntimeError:/);
});

Deno.test("parent body errors keep their location", async () => {
  const body = await execute(
    "#a bind: ($Object clone |> %extend(m: { $absent })). #b bind: ($a clone |> %extend(m: { %super() })).\n$b m.",
  );
  assert.notEqual(body.code, 0);
  assert.match(text(body.stderr), /fixture\.toss:1:41: RuntimeError:/);
});
