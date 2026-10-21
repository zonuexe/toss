# ADR-34: Unique symbols

`$Symbol generateUnique` returns a fresh Symbol on every call. It is never
interned and cannot collide with a Named symbol or another generated Symbol.
This completes the tour's first unique-key case without adding new syntax.

`$Symbol` is a fresh ordinary Object in each file's root Environment. Its own
`generateUnique` slot is a zero-argument method. Cloning, overriding slots and
shadowing this binding follow existing Object and Environment rules. The
factory method is not a fallback on all Objects.

Unique symbols can be passed around and used with `at:`, `at:put:`, computed
`%extend` labels and both dynamic-send messages. Identity, inheritance and
actual-receiver `self` are preserved. Retaining the key allows access; there
is no absolute privacy guarantee against key sharing or future interop.

For a Unique symbol, `toString` returns `<unique>` and `inspect` returns
`#<unique>`. Missing-key and unknown-message diagnostics use `#<unique>` too.
These generic labels do not distinguish identities or encode readable Symbol
literals. Named symbol conversions and diagnostics stay unchanged. Description
arguments, readable unique IDs, serialization and String/Symbol conversion
remain future work.

`bind:` still writes under the exact Symbol key in the current Environment.
Binding a Unique symbol does not create a name that `$name` can fetch. No
dynamic Environment-fetch API is added.

```text
#key bind: $Symbol generateUnique.
#obj bind: ($Object clone |> %extend(
  name: 'Toss',
  ($key): { $self name }
)).
($obj perform: $key) print.
```
