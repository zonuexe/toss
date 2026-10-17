# ADR-23: Array reduce

Arrays receive `reduce:with:`. The first argument is the initial accumulator;
the second is a Block that receives the accumulator and the current element.
The array copies its slots before the first callback, then calls the Block once
per copied value from left to right. Each callback result becomes the next
accumulator, and the final accumulator is returned.

The initial value is used for every input, including empty arrays. Empty input
returns that exact value. The accumulator may be any Toss value. Reduction does
not coerce values, mutate the source, or copy values deeply. Callbacks can
explicitly mutate values; the copied slots protect against replacement, while
nested references remain shared.

The callback must be a Block, even for empty input. Its arity is checked only
when called, so a wrong-arity Block is accepted for an empty array. Each call
uses the Block's ordinary lexical environment and lexical `$self`. Errors in
the callback stop iteration and keep their source position; validation and
arity errors point to the `reduce:with:` send.

```text
([1, 2, 3] reduce: 0 with: { sum, x -> $sum add: $x }) print.
```

Compile and run the example:

```sh
mise exec -- deno task compile examples/array-reduce.toss -o out/array-reduce.js
mise exec -- deno run out/array-reduce.js
```
