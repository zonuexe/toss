# ADR-20: Counted repetition

Numbers receive `times:` as an ordinary prelude message. Its receiver must be a
nonnegative safe integer. Negative zero is a valid zero count. The argument must
be a block, including when the count is zero.

The block runs with no arguments, exactly once per count, in order. Each call
uses ordinary block invocation, including a fresh local environment and lexical
`self`. The result is the last invocation's result; zero repetitions return
native Nil. A block's arity is checked only when it is invoked. A body error
stops repetition immediately and keeps its original source location.

Receiver and block expressions are evaluated once in normal left-to-right
order. Invalid counts, block types, and invoked arities report at the `times:`
send. Counts are not coerced and have no additional repetition limit.

```text
(3 times: { 'again' print }) print.
```
