# ADR-18: Numbers and booleans

Numbers use finite JavaScript Number values (IEEE 754). This keeps the runtime
small and supports fractional arithmetic, with JavaScript's rounding and
precision limits. There is no separate integer or arbitrary-precision type.

Decimal literals have an optional leading minus, integer digits, and an optional
fraction with at least one digit after the decimal point. Leading zeros are
decimal. A period without a following digit remains a statement terminator.
Leading plus, `.5`, exponents, hexadecimal, digit separators, and named
nonfinite literals are unsupported. Identifier suffixes and overflowing
literals are syntax errors. Negative zero is preserved in generated values;
its string representation is `0`.

Numbers receive `add:`, `subtract:`, `multiplyBy:`, `divideBy:`, `remainder:`,
and `negated`. Numeric binary messages require a Number argument and do not
coerce other values. Zero divisors (including negative zero) and nonfinite
arithmetic results are runtime errors at the message location. Division and
signed remainder otherwise follow JavaScript arithmetic.

`equals:`, `lessThan:`, `greaterThan:`, `lessThanOrEqual:`, and
`greaterThanOrEqual:` compare numbers and return native booleans. `equals:` is
numeric-only for now; it does not define equality for other types. Positive and
negative zero compare equal.

The root environment provides ordinary shadowable `$True` and `$False`
bindings. Booleans receive `not`. Comparisons return actual booleans even when
these names are shadowed. No reserved words or implicit truthiness are added.

Number and Boolean `toString` and `inspect` use their JavaScript string form.
Both types use the existing `print` and `dump` protocol and return their receiver.
Their unknown messages report their own type. Object keys remain strings or
symbols; numbers and booleans are invalid keys. Operators and conditionals are
later work.
