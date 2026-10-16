import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

const successes = [
  { source: "(0 times: { 'wrong' print }) dump.", output: "nil\n" },
  { source: "(-0 times: { 'wrong' print }) dump.", output: "nil\n" },
  { source: "(1 times: { 'once' print. 7 }) print.", output: "once\n7\n" },
  {
    source:
      "#o bind: $Object clone. $o at: 'n' put: 0. ((3 times: { $o at: 'n' put: (($o at: 'n') add: 1) })) print. ($o at: 'n') print.",
    output: "3\n3\n",
  },
  { source: "(2 times: { }) dump.", output: "nil\n" },
  { source: "#Nil bind: 'shadow'. (0 times: { }) dump.", output: "nil\n" },
  { source: "(0 times: { x -> $x }) dump.", output: "nil\n" },
  {
    source:
      "#o bind: $Object clone. $o at: 'run' put: { #local bind: (($self at: 'n') add: 1). $self at: 'n' put: $local }. #child bind: $o clone. $child at: 'n' put: 0. (2 times: { $child run }) print. ($child at: 'n') print.",
    output: "2\n2\n",
  },
] as const;

for (const fixture of successes) {
  Deno.test(`times: succeeds: ${fixture.source}`, async () => {
    const result = await execute(fixture.source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), fixture.output);
    assert.equal(text(result.stderr), "");
  });
}

const failures = [
  {
    source: "(-1 times: { 'wrong' print }).",
    reason: "Nonnegative safe integer required.",
    output: "",
  },
  {
    source: "(1.5 times: { 'wrong' print }).",
    reason: "Nonnegative safe integer required.",
    output: "",
  },
  {
    source: "(9007199254740992 times: { 'wrong' print }).",
    reason: "Nonnegative safe integer required.",
    output: "",
  },
  {
    source: "(0 times: 'bad').",
    reason: "Block argument required.",
    output: "",
  },
  {
    source: "(1 times: 'bad').",
    reason: "Block argument required.",
    output: "",
  },
  {
    source: "(1 times: { x -> $x }).",
    reason: "Block expects 1 argument(s), received 0.",
    output: "",
  },
  {
    source: "'bad' times: { }.",
    reason: 'Unknown message "times:" for String.',
    output: "",
  },
] as const;

for (const fixture of failures) {
  Deno.test(`times: reports failure: ${fixture.source}`, async () => {
    const result = await execute(fixture.source);
    assert.notEqual(result.code, 0);
    assert.ok(
      text(result.stderr).includes(fixture.reason),
      text(result.stderr),
    );
    assert.equal(text(result.stdout), fixture.output);
  });
}

Deno.test("times: evaluates receiver and block expression once in order", async () => {
  const result = await execute(
    "#receiver bind: { 'receiver' print. 2 }. #make bind: { 'block' print. { 'body' print } }. ($receiver value) times: ($make value).",
  );
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "receiver\nblock\nbody\nbody\n");
  assert.equal(text(result.stderr), "");
});

Deno.test("times: stops at the first body error and keeps its location", async () => {
  const result = await execute(
    "#n bind: 0.\n(3 times: {\n  #n bind: (($n add: 1)).\n  $missing\n}).",
  );
  assert.notEqual(result.code, 0);
  assert.ok(
    text(result.stderr).includes(
      'fixture.toss:4:3: RuntimeError: Unbound name "missing".',
    ),
    text(result.stderr),
  );
  assert.equal(text(result.stdout), "");
});

Deno.test("times: count and arity errors use the send location", async () => {
  for (
    const [source, column, reason] of [
      [
        "'before' print.\n  1.5 times: { }.",
        7,
        "Nonnegative safe integer required.",
      ],
      [
        "'before' print.\n  1 times: { x -> $x }.",
        5,
        "Block expects 1 argument(s), received 0.",
      ],
    ] as const
  ) {
    const result = await execute(source);
    assert.notEqual(result.code, 0);
    assert.ok(
      text(result.stderr).includes(
        `fixture.toss:2:${column}: RuntimeError: ${reason}`,
      ),
      text(result.stderr),
    );
    assert.equal(text(result.stdout), "before\n");
  }
});
