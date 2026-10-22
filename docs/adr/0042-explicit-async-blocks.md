# ADR-42: Explicit async Blocks and await

The user accepted Q1-Q5 of the async discussion. Add `%async({ ... })` and
`%await(expression)` so Toss can read Hono request bodies and write middleware
that waits for downstream work. Ordinary Blocks, messages and Toss module
initialization stay synchronous.

## Syntax and execution

`%async({ parameters -> body })` creates a lexical Block with an explicit async
mode. Require one literal Block and an adjacent `(`. `%await(expression)` takes
exactly one full Toss expression and also requires adjacency. Check await
placement after macro expansion: it is valid only in the directly enclosing
async Block. Each nested Block resets the boundary. Reject file-root await and
await in ordinary nested Blocks, including unused code. A macro may generate
an await expression for an enclosing runtime async Block.

Use the normal Block invocation messages, exact arity, method dispatch, lexical
bindings, hygiene, `$self` and parent calls. Invocation starts immediately and
returns an opaque async result, displayed and passed to JS as a JS reference.
The body runs until a wait or completion. Each await evaluates its operand once,
then suspends the current call. Even an ordinary value creates an asynchronous
continuation. No ordinary Prelude message implicitly waits for a result.

An async conditional branch is explicit. The caller awaits the selected result:

```text
%await($condition ifTrue: %async({
  %await($promise)
}) ifFalse: {
  42
})
```

## Results and the JS boundary

Awaiting a Toss async result returns its original Toss result with identity
preserved, including Object, Array, Symbol, Block and Nil values. Awaiting an
ordinary Toss value also preserves it. Never inspect or assimilate a plain
Toss Object's `then` slot. Use an internal result envelope so host Promise
resolution does not accidentally interpret Toss data as a thenable.

Awaiting a JS reference uses native JS await behavior, including Promise and
thenable resolution. Convert its resolved native value with ADR-38. A native
Array therefore becomes a JS reference; a Toss Array returned by a Toss async
Block remains an Array. Preserve the distinction between these result origins.
The final expression of an async Block is its Toss result; explicitly await a
nested async result or native Promise when its fulfilled value is needed.

Passing a Toss async result to JS exposes a stable native Promise. Its fulfilled
value uses Toss-to-JS conversion, so a Response reference becomes the original
Response. Use lazy, cached host conversion so a purely Toss result such as a
Block can be awaited inside Toss without forcing a JS export. The existing
`asJSCallback` adapter can return this Promise to Hono. Internal result envelopes
are never exposed to host code. Existing direct Block rejection still applies
when exporting a fulfilled ordinary Block to JS.

## Errors and deferred work

Wrong arity fails at the invocation boundary as before. Body failures reject
the async result. Preserve Toss error positions and macro traces across waits.
A native JS rejection becomes a Toss runtime error at the await site with its
original thrown value as cause. An enclosing JS expression keeps ADR-38's
existing wrapping rules. Do not roll back earlier effects or capture output.

Compile-time macro execution cannot create or await async runtime work, but
quotation can produce runtime async forms. File-root await, async module
initialization, async collection helpers, cancellation, scheduling APIs and
language-level exception handling remain separate work. Existing Array and
Boolean Prelude messages keep their current contracts.
