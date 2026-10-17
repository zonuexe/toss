# ADR-26: Minimal arithmetic macro

The built-in arithmetic form `$()` accepts numeric literals, explicit `$name`
fetches, arithmetic parentheses, and nested `$()` forms. It supports `+`, `-`,
`*`, `/`, and `%`. Multiplication, division, and remainder bind more tightly
than addition and subtraction; operators at one precedence associate left.
Unary minus is supported, including negative numeric values and negative zero.
Unary plus is not supported.

The parser lowers each binary operator to the existing `add:`, `subtract:`,
`multiplyBy:`, `divideBy:`, or `remainder:` message, and unary minus to
`negated`. Generated sends keep the operator's source location. The normal
message dispatch path evaluates operands and reports type, method, and numeric
errors. This permits objects to implement these messages without adding
arithmetic-specific type checks or JavaScript arithmetic to the compiler.

The macro must begin with `$(` without intervening whitespace. Its result is
an ordinary primary expression and can appear in arrays, blocks, keyword
arguments, groups, pipelines, and unary message chains. Within operands, only
the listed literals, fetches, groups, and nested arithmetic forms are accepted;
unary and keyword messages, bare identifiers, strings, comparisons, logical
operators, other macros, and general Toss expressions are outside this slice.
Operators outside `$()` remain invalid syntax. Existing `$name` fetches and
ordinary grouping parentheses keep their existing meanings.

This implements only the arithmetic macro slice described here. It does not
implement the broader macro system or aspirational syntax in the language
tour.

```text
$(1 + 2 * 3) print.
#x bind: 10.
$($x - 4) print.
```

Compile and run the example:

```sh
mise exec -- deno task compile examples/arithmetic.toss -o out/arithmetic.js
mise exec -- deno run out/arithmetic.js
```

## Consequences

Arithmetic syntax remains local to the macro lexer state. The compiler keeps
numeric behavior in the prelude, where method overrides, operand evaluation,
and runtime diagnostics already live. Later work may extend the macro system
without making operators valid throughout Toss source.
