# ADR-41: Explicit JavaScript callback adapters

Hono needs JS functions that execute Toss Blocks. Add the unary Block message
`asJSCallback` to the Prelude library. Return an opaque JS reference to a
native adapter function. This extends ADR-38 without implicitly converting
ordinary Blocks when they cross the JS boundary. The user authorized the next
Hono interop slice after static imports.

## Invocation and values

A callback uses the first N host arguments, where N is the Block's declared
parameter count. Ignore extra arguments before converting them. Reject fewer
than N arguments before entering the Block. An explicit JS `undefined` counts
as an argument and converts to Nil. Normal Toss Block calls still require
exactly N arguments. This supports Hono handlers that only use Context while
the framework supplies Context and Next, and one-argument Array callbacks.

Convert each selected argument with ADR-38's JS-to-Toss rules, left to right.
JS objects, arrays and functions become opaque JS references. Reuse identity
wrappers. Do not recursively convert their contents or copy objects.
Run the Block once and convert its result with the existing Toss-to-JS rules.
A returned JS reference unwraps, including a Response or Promise reference.
Nil returns JS null; a directly returned ordinary Block is still rejected.
The adapter is synchronous and does not await a Promise or suspend Toss code.

## Identity and lexical context

Repeated `asJSCallback` conversions of the same Block return the same native
function and the same JS reference within one execution. Different Block
instances get different adapters. Use weak identity caching, so a host can
register and unregister a callback by identity. The first conversion site
provides the adapter's boundary diagnostics when the cached adapter is reused.

Ignore JS `this` and invoke the Block as an ordinary lexical Block. Do not
introduce a method invocation, inject `$self`, or pass a host receiver into
the Toss method protocol. Captured bindings, `$self`, `%super` and macro scope
keep their existing behavior. A callback remains callable after its creating
Block or method has returned. Each call gets the normal fresh local Environment.

## Errors and limits

Argument count and conversion errors identify the adapter conversion site.
Toss body errors keep their original location and macro trace. Let thrown
values propagate synchronously to the host without changing their identity.
If a JS expression invokes a callback and lets it throw, ADR-38's outer JS
boundary still wraps the thrown value as its original cause. Do not capture
host output or roll back earlier effects.

`asJSCallback` is a runtime operation. Compile-time macro execution cannot
create host callbacks, but macros may generate a runtime conversion message.
JS references keep their current limited messages and do not become Toss
Blocks. Promise waiting, async Blocks, mapping Nil to undefined, exposing host
`this`, variadic Block parameters and deep value conversion remain deferred.

ADR-42 later adds explicit async Blocks and await. The callback adapter itself
keeps the conversion and invocation rules above; an async result crosses to
JS as a native Promise.

```text
#handler bind: { context ->
  %js(c = $context; c.text('Hello, Toss!'))
} asJSCallback.
%js(app = $app, handler = $handler; app.get('/', handler)).
```
