import assert from "node:assert/strict";
import { execute, text } from "./helpers.ts";

for (
  const [name, source, expected] of [
    [
      "free references use definition scope while arguments use caller scope",
      "#x bind: 1. %macro(#bump, { s -> %`((%,($s)) add: $x) }). ({ x -> %bump($x) } value: 10) print.",
      "11\n",
    ],
    [
      "introduced local bindings do not capture caller Fetches",
      "#temp bind: 40. %macro(#local, { s -> %`({ #temp bind: 2. (%,($s)) add: $temp } value) }). %local($temp) print. $temp print.",
      "42\n40\n",
    ],
    [
      "introduced parameters do not capture spliced caller Fetches",
      "#n bind: 40. %macro(#with, { s -> %`({ n -> (%,($s)) add: $n } value: 2) }). %with($n) print.",
      "42\n",
    ],
    [
      "an explicitly spliced parameter binds syntax with the same caller origin",
      "#n bind: 40. %macro(#lambda, { s -> #parts bind: $s children. %`({ %,($parts at: 0) -> %,($parts at: 2) }) }). (%lambda(n, $n) value: 7) print. $n print.",
      "7\n40\n",
    ],
    [
      "escaped closures retain introduced and caller scopes",
      "%macro(#capture, { s -> %`({ #temp bind: 2. { (%,($s)) add: $temp } } value) }). #f bind: ({ temp -> %capture($temp) } value: 40). $f value print.",
      "42\n",
    ],
    [
      "quoted Named Symbol has normal runtime identity",
      "%macro(#symbol, { s -> %quote(#name) }). (%symbol() equals: #name) print.",
      "true\n",
    ],
    [
      "hygienic binding does not rename Symbol values",
      "%macro(#local, { s -> %quote({ #temp bind: 1. #temp } value) }). (%local() equals: #temp) print.",
      "true\n",
    ],
    [
      "a spliced bind updates the caller Environment",
      "#v bind: 1. %macro(#wrap, { s -> %`((%,($s)) add: 1) }). %wrap(#v bind: 4) print. $v print.",
      "5\n4\n",
    ],
    [
      "input macro names retain caller definition order",
      "%macro(#id, { s -> $s }). %macro(#later, { s -> %quote(7) }). %id(%later()) print.",
      "7\n",
    ],
    [
      "templates can use an earlier macro",
      "%macro(#seven, { s -> %quote(7) }). %macro(#wrap, { s -> %quote(%seven()) }). %wrap() print.",
      "7\n",
    ],
    [
      "expander preparation can use an earlier macro",
      "%macro(#id, { s -> $s }). %macro(#seven, { s -> %id(%quote(7)) }). %seven() print.",
      "7\n",
    ],
    [
      "earlier macros remain hygienic inside compile-time expander code",
      "%macro(#wrap, { s -> %`({ #temp bind: %quote(9). %,($s) } value) }). %macro(#seven, { s -> #temp bind: %quote(7). %wrap($temp) }). %seven() print.",
      "7\n",
    ],
    [
      "a quote form inside quasiquoted data does not add quasiquote depth",
      "%macro(#makeQuote, { s -> %`(%quote(%,($s))) }). %macro(#seven, { s -> %makeQuote(7) }). %seven() print.",
      "7\n",
    ],
    [
      "generated parent call keeps execution context",
      "%macro(#parent, { s -> %quote(%super()) }). #a bind: ($Object clone |> %extend(m: { 7 })). #b bind: ($a clone |> %extend(m: { %parent() })). $b m print.",
      "7\n",
    ],
    [
      "introduced free self does not capture the calling method",
      "#self bind: 'definition'. %macro(#who, { s -> %quote($self) }). #obj bind: ($Object clone |> %extend(m: { %who() })). $obj m print.",
      "definition\n",
    ],
    [
      "a generated method receives its own self",
      "#self bind: 'definition'. %macro(#body, { s -> %quote({ $self n }) }). #obj bind: ($Object clone |> %extend(n: 7, m: %body())). $obj m print.",
      "7\n",
    ],
    [
      "JS binding expressions preserve caller scope",
      "%macro(#native, { s -> %`(%js(x = %,($s); x + 1)) }). ({ n -> %native($n) } value: 6) print.",
      "7\n",
    ],
    [
      "JS binding expressions keep introduced and caller Fetch scopes separate",
      "#n bind: 10. %macro(#native, { s -> %`(%js(x = %,($s), y = $n; x + y)) }). ({ n -> %native($n) } value: 3) print.",
      "13\n",
    ],
    [
      "quasiquote traverses Toss bindings inside nested JS forms",
      "%macro(#native, { s -> %`(%js(x = %js(y = %,($s); y + 1); x + 1)) }). ({ n -> %native($n) } value: 5) print.",
      "7\n",
    ],
    [
      "unquote text inside a Toss string in a JS prefix remains literal",
      "%macro(#native, { s -> %`(%js(x = '%,($missing)'; x)) }). %native() print.",
      "%,($missing)\n",
    ],
  ] as const
) {
  Deno.test(`user macro hygiene: ${name}`, async () => {
    const result = await execute(source);
    assert.equal(result.code, 0, text(result.stderr));
    assert.equal(text(result.stdout), expected);
  });
}

Deno.test("self-recursive generated syntax can terminate", async () => {
  const result = await execute([
    "%macro(#peel, { s ->",
    "($s children length equals: 1) ifTrue: {",
    "#first bind: ($s children at: 0).",
    "($first kind equals: #group) ifTrue: {",
    "%`(%peel(%,@($first children)))",
    "} ifFalse: { $s }",
    "} ifFalse: { $s }",
    "}).",
    "%peel(((7))) print.",
  ].join("\n"));
  assert.equal(result.code, 0, text(result.stderr));
  assert.equal(text(result.stdout), "7\n");
});
