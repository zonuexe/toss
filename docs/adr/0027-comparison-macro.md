# ADR-27: Comparisons in the arithmetic macro

The `$()` arithmetic macro also accepts `<`, `<=`, `>`, `>=`, `==`, and `!=`.
Arithmetic binds more tightly than comparisons. A macro or arithmetic group
accepts one unparenthesized comparison; another comparison at that level is a
syntax error. Parentheses and nested `$()` forms allow explicit grouping.

Operators lower to the existing `lessThan:`, `lessThanOrEqual:`, `greaterThan:`,
`greaterThanOrEqual:`, and `equals:` messages. `!=` sends `equals:` and then
`not`. Both sends use the `!=` source location. Normal message dispatch keeps
numeric checks, object overrides, evaluation order, and runtime diagnostics in
the existing runtime. There is no coercion, new equality protocol, or implicit
truthiness.

Comparison operators are local to `$()` and its nested arithmetic groups.
Operands remain numbers, `$name` fetches, parenthesized arithmetic or comparison
groups, and nested `$()` forms. Longest valid two-character operators are
recognized first; unsupported syntax such as `===`, `!==`, and chained
comparisons is rejected.

```text
$(1 + 2 * 3 < 8) print.
$(2 != 3) print.
```

Compile and run [the comparison example](../../examples/comparisons.toss):

```sh
mise exec -- deno task compile examples/comparisons.toss -o out/comparisons.js
mise exec -- deno run out/comparisons.js
```
