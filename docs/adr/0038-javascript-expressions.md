# ADR-38: Explicit JavaScript expression interop

The user accepted Q3-Q16 and the final design summary. Use `%js(...)` as an
explicit boundary between Toss messages and JavaScript operations. This follows
the named macro sigil in ADR-32. It replaces the proposed `$JS` bridge API.

## Syntax and scope

`%js(expression)` evaluates exactly one JavaScript expression. Function and
arrow expressions may contain statements; an immediately invoked function
expression can execute them. The opener requires adjacency to `(`. JavaScript
strings, comments, regex literals, templates and nested delimiters keep their
JavaScript meaning. Toss strings outside this macro remain unchanged.

`%js(x = TossExpression, y = TossExpression; JavaScriptExpression)` explicitly
passes values into the JS expression. Evaluate the Toss expressions once,
left to right, in the original Environment before running JavaScript. They do
not see the declared JS names. Names are distinct ASCII identifiers valid as
strict JavaScript bindings. The JS names are immutable locals. Only an outer
binding separator selects this form: `%js(obj.x = 1)` is a JS assignment.

Run the expression in a strict synchronous function context with outer `this`
equal to `undefined`. Explicit names and host globals are available; the
compiler's Environment and generated runtime locals are not public APIs.
This is arbitrary host JavaScript execution, not a security sandbox. Reject
outer `await`, but allow async function expressions and dynamic `import()`
expressions. Do not await Promise results. JavaScript syntax errors are
compile-time errors with Toss source positions. Do not run user JS to compile.

## Value boundary

JS strings, finite Numbers and Booleans become ordinary Toss values. Both
`null` and `undefined` become Nil. JS Object, Array and Function results become
opaque JS references, including Promise objects. Reject other results,
including non-finite Numbers, BigInt and Symbol, with a runtime error.

JS references unwrap to their original value when passed back into `%js`.
The same JS object has the same reference wrapper within an execution.
References support only `toString`, `inspect`, `print` and `dump`; both string
representations are `<js>`. Display returns the reference as usual. Object
slot access, cloning, extension and Block invocation do not expose a wrapper.

Pass Toss primitives, Nil, Object, Array and Symbol values directly to JS;
Nil becomes `null`. Object and Array changes are shared by reference. A JS
result is classified by the return rules even if it was originally passed
from Toss, so returning a Toss Array produces a JS reference. Reject a directly
passed Toss Block. Do not recursively inspect Object/Array contents. Calling
a nested Block from JS has no supported callback contract in this slice.

JS exceptions become Toss runtime errors at the macro position and retain the
original thrown value as `cause`. Do not roll back effects. Toss argument
errors retain their own positions and stop later argument evaluation. Runtime
conversion errors also identify the macro position.

## Deferred

Toss Block callback adapters, awaiting Promises, a dedicated JS module/package
loader, and host output capture remain separate work. Calling JS APIs keeps
their ordinary host behavior and permissions; this macro does not capture
`console.log` output or limit side effects.
