# ADR-31: Dynamic messages without arguments

Objects receive `perform:` with a String or Symbol key. It selects and sends a
message with no arguments, then returns its result. This implements the first
dynamic-send case deferred by [ADR-16](0016-method-dispatch-and-self.md) and
[ADR-30](0030-extend-dynamic-keys.md). Argument-bearing dynamic sends remain
deferred.

```text
#action bind: #greet.
#parent bind: ($Object clone |> %extend(
  name: 'parent',
  ($action): { $self name }
)).
#child bind: ($parent clone |> %extend(name: 'child')).
($child perform: $action) print.
```

Lookup includes inherited slots. Blocks run with no arguments and with the
actual receiver as `self`, keeping their defining Environment and normal exact
arity checks. Non-block slots return their stored value, including Nil. A
returned Block or Object is returned unchanged. `at:` still reads Blocks as
data without invocation.

String and Symbol keys stay distinct. A Symbol selects that exact slot and
does not select a string-keyed slot or prelude message with the same name.
String slot keys can contain any text, including empty strings, whitespace,
Unicode, and colons; their spelling does not determine a stored Block's arity.
There is no implicit conversion or symbol interning during dispatch.

String selectors also use the existing Object prelude fallback. Thus
`perform: 'clone'` clones the receiver, and `perform: 'print'` and
`perform: 'dump'` use the normal conversions. Slots take precedence, including
slots whose keys name prelude messages. When there is no matching slot,
selecting a prelude that requires arguments is a runtime error before its
implementation runs. The dynamic send never supplies missing JavaScript
arguments to such a prelude.

`perform:` itself remains an ordinary overridable prelude message. It is
provided only for Objects. Arrays, Blocks, and primitive values do not receive
it in this slice. Unique symbols remain deferred.

The receiver is evaluated once, then the key expression once, as for any
keyword message. Invalid key types, missing keys, and invocation arity errors
point to the `perform:` call. Errors evaluating the receiver or key, or inside
the selected method body, retain their own source locations. An error stops
the remaining expression and later statements.

```sh
mise exec -- deno task compile examples/perform.toss -o out/perform.js
mise exec -- deno run out/perform.js
```
