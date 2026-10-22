# Toss Hono adapter

This library wraps the native Hono API for Toss applications. It owns the
JavaScript boundary; each consuming app owns its route design, validation,
responses, middleware policy and error handling. The package is pinned in
`adapter.toss` as `npm:hono@4.12.12`.

Hono's [Hono API](https://hono-ja.pages.dev/docs/api/hono) and
[Context API](https://hono-ja.pages.dev/docs/api/context) are the public API
background. The Toss facades intentionally expose only the operations listed
here. See also [ADR-38](../../docs/adr/0038-javascript-expressions.md),
[ADR-40](../../docs/adr/0040-static-javascript-imports.md),
[ADR-41](../../docs/adr/0041-javascript-callback-adapters.md),
[ADR-42](../../docs/adr/0042-explicit-async-blocks.md), and
[ADR-43](../../docs/adr/0043-macro-library-imports.md).

## App facade

Import the module and create an app:

```text
#adapter bind: %import('../../lib/hono/adapter.toss').
#app bind: ($adapter create).
```

The facade supports `get:handle:`, `post:handle:`, `use:handle:`, `onError:`,
`request:`, and `request:options:`. A route handler receives one Toss Context
facade. Middleware receives that Context and a lexical zero-argument Block
that invokes Hono's `next()`. Error handlers receive the original thrown value
as a JS reference and a Context facade. Sync and async Blocks are supported.
Returned Response references pass through unchanged, and async callbacks
return native Promises. Callback failures retain their Toss error and cause
information; the app chooses its error handler.

The facade keeps the native Hono instance under a lexical unique-symbol slot.
`native` is the explicit escape hatch for APIs outside the wrapper; it does not
proxy arbitrary messages. The adapter keeps no global per-request cache.

## Context facade

The Context facade exposes `param:`, `body`, `text:`, `json:status:`,
`header:to:`, `get:`, and `set:to:`. `body` returns Hono's native JSON Promise,
which an async Toss handler can await. Every method forwards to the matching
Hono Context operation. Different facade objects for the same request still
share Hono's `c.set` and `c.get` storage.

Hono JSON values and other JavaScript Objects and Arrays remain opaque JS
references in Toss under ADR-38. The adapter does not recursively convert or
copy their contents. `hasString:at:` and `field:of:` only provide generic host
JSON shape and property access; the app chooses required fields and response
policy. `join:with:` joins two Strings without adding core String messages.
`isInvalidJSON:` recognizes a native SyntaxError or a `cause` that is one.

## Supporting modules

`testing.toss` exports generic status, header, field, JSON/text body, strict
equality assertion, response report, Promise.all, native Array indexing via
`at:in:` (index first, native Array second), and RequestInit construction. It
contains no routes, expected values, or sample headers.

`deno.toss` exports `serve:` and `serve:port:`. The first uses
`Deno.args[0]`, defaulting to port 8000, and binds to `127.0.0.1`. Importing
this module does not listen; the caller invokes one of its methods explicitly.

## Shared macro library

Load shared syntax at compile time:

```text
%macroImport('../../lib/hono/macros.toss').
```

`%request(fullExpression)` groups and awaits the complete caller expression
exactly once. `%runAsync({ ... })` expands a literal Block into an async Block,
adapts it to a JS callback, and launches it. Neither macro captures `$app` or
other runtime bindings; spliced syntax keeps caller scope. Macro libraries may
contain only `%macro` declarations and cannot import another macro library.

## Low-level demonstrations

`examples/hono/imports.toss` and `examples/hono/callbacks.toss` intentionally
show explicit `%js` use for the raw host module and callback APIs. They are
interop walkthroughs, not application templates.
