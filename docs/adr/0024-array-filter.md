# ADR-24: Array filter

Arrays receive `filter:` with a Block argument. The prelude checks that the
argument is a Block even when the receiver is empty. It copies the receiver's
slots before invoking the first callback, then calls the Block once per copied
value from left to right with that value as its only argument.

Each callback uses its ordinary lexical environment and lexical `$self`. Its
result must be a Boolean. True retains the original snapshot value by
reference; false drops it. Other Toss values are errors. The accepted values
remain in input order in a fresh array. Empty input and no matches return a
fresh empty array.

Filtering does not mutate its receiver. A callback can mutate it explicitly;
the snapshot protects against replaced slots, while nested objects and arrays
remain shared. The snapshot is taken after the receiver and callback
expressions have been evaluated.

Block arity is checked by normal invocation. An incorrect arity fails when an
element invokes the callback, but an empty receiver does not invoke it.
Callback errors stop iteration and keep the body's source location. Argument,
arity, and non-Boolean result errors use the `filter:` send location.

```text
#numbers bind: [1, 2, 3, 4].
#even bind: ($numbers filter: { number ->
  ($number remainder: 2) equals: 0
}).
($even length) print.
($even at: 0) print.
($even at: 1) print.
```

Compile and run the example:

```sh
mise exec -- deno task compile examples/array-filter.toss -o out/array-filter.js
mise exec -- deno run out/array-filter.js
```

Array display is defined in [ADR-25](0025-array-display.md). Native JavaScript
array methods are not Toss messages.
