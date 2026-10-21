# ADR-33: Dynamic messages with an argument array

Objects receive `perform:withArguments:` with a String or Symbol selector and
an Array of arguments. This extends [ADR-31](0031-perform-without-arguments.md)
while keeping `perform:` as the zero-argument form. Arrays, Blocks and primitive
values do not receive either message.

```text
#operation bind: #sum.
#parent bind: ($Object clone |> %extend(
  base: 10,
  ($operation): { left, right -> $self base add: ($left add: $right) }
)).
#child bind: ($parent clone |> %extend(base: 20)).
($child perform: $operation withArguments: [2, 3]) print.
```

Keep String and Symbol identity, prototype lookup, slot precedence, lexical
Environment and actual-receiver `self` exactly as for ordinary sends. Pass the
argument elements in order using a shallow snapshot. Do not mutate the input
Array or clone its elements. Return the selected message's exact result.

A Block slot requires its declared parameter count, regardless of its key's
spelling. Thus a Symbol or a String without colons can select a method taking
multiple arguments. A non-block slot returns its stored value when the Array
is empty; otherwise it is not callable. Missing selectors remain errors, and
Symbols never select String slots or prelude messages.

Only when a String selector reaches an Object prelude fallback, require the
argument count to match its selector's number of colons. For example, `clone`
takes zero, `at:` takes one and `at:put:` takes two. Check both missing and
extra arguments before entering the prelude implementation. Matching slots
take precedence over this prelude check, including inherited overrides.
The dynamic-send messages remain ordinary overridable prelude messages.

Evaluate the receiver, selector and argument-Array expression once from left
to right before dispatch. Array literals evaluate their elements in order.
Then validate the selector's String/Symbol type and the argument Array's type.
This preserves ordinary argument effects even when validation later fails.
No iterable, Array-like Object or Block is accepted in place of an Array.

Validation, lookup and invocation arity errors use the outer dynamic-send
position. Errors evaluating its expressions, or inside the selected method,
retain their own positions. A failure stops later statements. Unique symbols
are specified in [ADR-34](0034-unique-symbols.md); parent calls remain future work.

```sh
mise exec -- deno task compile examples/perform-arguments.toss -o out/perform-arguments.js
mise exec -- deno run out/perform-arguments.js
```
