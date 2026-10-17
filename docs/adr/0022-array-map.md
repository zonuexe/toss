# ADR-22: Array map

Arrays receive `map:` with a Block argument. The prelude checks that the
argument is a Block even when the receiver is empty. It copies the receiver's
slots before invoking the first callback, then calls the Block once per copied
value from left to right with that value as its only argument.

Each callback runs with its ordinary lexical environment and lexical `$self`.
The callback's result is stored by reference in a fresh array, which `map:`
returns. Values such as Nil, booleans, objects, arrays, and Blocks remain
unchanged. An empty receiver returns a fresh empty array. `map:` itself does not
mutate its receiver; a callback may still mutate it explicitly. The copied
slots keep their original values if the callback replaces source slots, while
referenced objects and nested arrays remain shared.

Block arity is checked by normal block invocation. Therefore an incorrect
arity fails when an element invokes the callback, but an empty receiver does
not invoke it. Callback errors stop iteration immediately and keep the body's
source location. Argument and arity errors use the `map:` send location.

```text
#numbers bind: [1, 2, 3].
#doubled bind: ($numbers map: { number -> $number multiplyBy: 2 }).
($doubled at: 0) print.
($doubled at: 1) print.
($doubled at: 2) print.
```

Array display remains undefined; read elements explicitly. Native JavaScript
array methods are not Toss messages.
