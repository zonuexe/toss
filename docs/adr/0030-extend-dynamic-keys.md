# ADR-30: Computed keys in object extensions

`#extend` accepts a parenthesized expression followed by `:` as an entry key.
This follows the computed-key form in the language tour and extends
[ADR-28](0028-extend-macro.md) and [ADR-29](0029-extend-string-keys.md).
The group contains exactly one full Toss expression, with no period inside.
Empty groups, missing delimiters, missing values, and trailing commas remain
syntax errors. Bare symbol or fetch labels still require parentheses.

```text
#field bind: 'score'.
#tag bind: #metadata.
#record bind: ($Object clone |> #extend(
  label: 'record',
  ($field): 42,
  ($tag): 'info'
)).
($record at: $field) print.
($record at: $tag) print.
```

Evaluate and check the target Object once before any entry. For each entry
from left to right, evaluate its key once, then its value once, then send
ordinary `at:put:`. Earlier writes are visible to later key and value
expressions. All expressions use the caller's existing Environment and lexical
`$self`; no temporary Toss bindings or local Environment are added.

The default setter accepts String or Symbol keys and preserves their distinct
identity. Key validation stays in the setter, after ordinary argument
evaluation, so a value's effects run before a default invalid-key error.
Custom setters keep control of accepted key types and actual writes. There is
no early key guard or coercion in the macro. Bare and quoted labels keep their
existing string-key meaning and can be mixed with computed keys.

A failing key expression stops before its value. A failing value stops before
the setter. Either failure stops later entries; earlier writes remain.
Implicit setter errors point to the opening parenthesis of the key group.
Key, value, and method-body errors retain their own source locations. The
macro still returns the exact original target regardless of setter returns.

Symbol-keyed Blocks are stored without invocation and can be fetched with
`at:`. Dynamic message sends and unique symbols remain deferred. The arithmetic
macro's operand grammar is unchanged.

```sh
mise exec -- deno task compile examples/extend-dynamic-keys.toss -o out/extend-dynamic-keys.js
mise exec -- deno run out/extend-dynamic-keys.js
```
