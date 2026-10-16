# ADR-19: Boolean conditionals

Booleans receive `ifTrue:`, `ifFalse:`, and `ifTrue:ifFalse:` as ordinary
prelude messages. These messages do not add syntax or reserved words, and
other values do not gain truthiness.

Each argument must be a block. All arguments are checked before any branch
runs. A selected block is called with zero arguments; only its arity is
checked. The other block in a compound conditional may have any arity because
it is not invoked. One-sided conditionals return native Nil when their block
is not selected. The compound form returns the selected block's result. An
empty selected block returns Nil.

Receiver and argument expressions keep normal eager, left-to-right evaluation.
Creating a block does not run its body. Selected blocks use ordinary block
invocation, including lexical environment and `self` behavior. Conditional
type and call errors use the conditional send location; errors inside a
selected body keep their body location.

`ifTrue:ifFalse:` is one complete selector with two arguments. It is not a
special chained-send form. Binding it in a source-level example therefore
uses a grouped expression:

```text
($True ifTrue: { 'yes' } ifFalse: { 'no' }) print.
```
