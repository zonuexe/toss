import assert from "node:assert/strict";
import { compile } from "../src/compiler.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";

for (
  const source of [
    "%unknown(1).",
    "%macro('name', { s -> $s }).",
    "%macro(#name, { %quote(1) }).",
    "%macro(#name, { a, b -> $a }).",
    "%macro(#js, { s -> $s }).",
    "%macro(#quote, { s -> $s }).",
    "%macro(#macro, { s -> $s }).",
    "%macro(#x, { s -> $s }). %macro(#x, { s -> $s }).",
    "{ %macro(#x, { s -> $s }). }.",
    "#x bind: %macro(#x, { s -> $s }).",
    "%macro(#id, { s -> $s }). %id (1).",
    "%macro(#id, { s -> $s }). %id().",
    "%macro(#id, { s -> $s }). %id(1. 2).",
    "%macro(#id, { s -> $s }). %id((1]).",
    "%macro(#bad, { s -> 1 }). %bad().",
    "%macro(#bad, { s -> $Nil }). %bad().",
    "%macro(#bad, { s -> [%quote(1)] }). %bad().",
    "%macro(#bad, { s -> %`(%,(1)) }). %bad().",
    "%macro(#bad, { s -> %`(%,@(%quote(1))) }). %bad().",
    "%macro(#bad, { s -> %`(%,@([1])) }). %bad().",
    "%macro(#bad, { s -> %quote(1 2) }). %bad().",
    "%macro(#bad, { s -> %quote(%export(1)) }). %bad().",
    "%macro(#bad, { s -> %quote(%macro(#x, { p -> $p })) }). %bad().",
    "%quote(1).",
    "%`(1).",
    "%,(%quote(1)).",
    "%,@([]).",
    "#unused bind: { %quote(1) }.",
    "%macro(#bad, { s -> $s spelling }). %bad(1).",
    "%macro(#bad, { s -> ($s children at: 0) children }). %bad(1).",
    "%macro(#bad, { s -> ($s children at: 0) delimiter }). %bad(1).",
    "%macro(#bad, { s -> $s at: 'children' put: [] }). %bad(1).",
    "%macro(#bad, { s -> $s |> %extend() }). %bad(1).",
    "%macro(#bad, { s -> 'compile output' print. %quote(1) }). %bad().",
    "%macro(#bad, { s -> 'compile output' dump. %quote(1) }). %bad().",
    "%macro(#bad, { s -> %js(1). %quote(1) }). %bad().",
    "%macro(#bad, { s -> %import('./not-a-compile-time-module.toss') }). %bad().",
    "#runtime bind: 7. %macro(#bad, { s -> $runtime }). %bad().",
    "%later(). %macro(#later, { s -> %quote(1) }).",
    "%macro(#early, { s -> %quote(%later()) }). %macro(#later, { s -> %quote(1) }). %early().",
    "%macro(#self, { s -> %self(1) }). %self().",
  ]
) {
  Deno.test(`user macro rejects invalid program: ${source}`, () => {
    assert.throws(() => compile(source, "rejected.toss"), TossSyntaxError);
  });
}

Deno.test("macro expansion depth has a source-positioned limit", () => {
  assert.throws(
    () =>
      compile(
        "%macro(#loop, { s -> %quote(%loop()) }). %loop().",
        "limits.toss",
      ),
    (error: unknown) => {
      assert.ok(error instanceof TossSyntaxError);
      assert.match(error.message, /limit|budget/i);
      assert.match(error.message, /loop/);
      assert.equal(error.location.file, "limits.toss");
      return true;
    },
  );
});

Deno.test("ordinary Toss recursion inside an expander has a computation limit", () => {
  assert.throws(
    () =>
      compile(
        "%macro(#loop, { s -> #again bind: { $again value }. $again value }). %loop().",
        "limits.toss",
      ),
    (error: unknown) => {
      assert.ok(error instanceof TossSyntaxError);
      assert.match(error.message, /limit|budget/i);
      assert.match(error.message, /loop/);
      return true;
    },
  );
});

Deno.test("deep generated syntax fails with a source-positioned compiler limit", () => {
  const source =
    "%macro(#deep, { s -> #cell bind: [%quote(1)]. 3000 times: { $cell at: 0 put: %`([%,($cell at: 0)]) }. $cell at: 0 }). %deep().";
  assert.throws(
    () => compile(source, "deep.toss"),
    (error: unknown) =>
      error instanceof TossSyntaxError &&
      /limit|budget/i.test(error.reason) && error.location.file === "deep.toss",
  );
});

Deno.test("deep quasiquote templates fail before native recursion overflows", () => {
  const template = "[".repeat(10000) + "1" + "]".repeat(10000);
  const source = "%macro(#deep, { s -> %`(" + template + ") }). %deep().";
  assert.throws(
    () => compile(source, "template.toss"),
    (error: unknown) =>
      error instanceof TossSyntaxError &&
      /limit|budget/i.test(error.reason),
  );
});

Deno.test("malformed generated syntax reports the macro expansion path", () => {
  assert.throws(
    () =>
      compile(
        "%macro(#broken, { s -> %quote(1 2) }).\n\n%broken().",
        "trace.toss",
      ),
    (error: unknown) => {
      assert.ok(error instanceof TossSyntaxError);
      assert.match(error.message, /broken/);
      assert.match(error.message, /trace\.toss:3:/);
      return true;
    },
  );
});

Deno.test("expansion failures keep the failing body position and invocation trace", () => {
  const source = "%macro(#broken, { syntax ->\n  $missing\n}).\n%broken().";
  assert.throws(
    () => compile(source, "origin.toss"),
    (error: unknown) => {
      assert.ok(error instanceof TossSyntaxError);
      assert.equal(error.location.line, 2);
      assert.equal(error.location.column, 3);
      assert.ok(error.trace?.some((entry) => entry.invocation.line === 4));
      return true;
    },
  );
});
