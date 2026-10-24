# ADR-49: Ahead-of-time JavaScript expressions

Compile `%js` expressions into native JavaScript functions in ordinary program
and ES module output. This removes the compiler's implicit use of string
evaluation when running ahead-of-time artifacts. ADR-38's explicit bindings,
strict execution context and value conversion remain the language contract.

## Scope and execution

Create the expression functions outside the generated Toss runtime's lexical
scope and pass them into that runtime. Runtime Environments, message helpers
and module state remain private. Generated import names and evaluator helper
names must avoid capturing identifiers used by user JavaScript. Host globals
and explicit JS bindings keep their existing roles.

Evaluate Toss binding expressions once, left to right. Convert values using
the existing boundary rules, declare JS bindings as immutable locals, and run
the expression in a strict zero-argument function with undefined `this`.
Do not execute JavaScript while compiling. Syntax validation remains a
compile-time operation. JavaScript exceptions retain the macro position and
original cause; conversion and Toss binding errors keep their existing order.

Program output executes normally. ES module output publishes its converted
default value after full entry initialization under ADR-48. Static JS imports
still initialize before Toss effects, including imports in unused Blocks.
Toss dependencies retain their private environments and lazy cached values.

## JavaScript source compatibility

The user chose compile-time errors for source forms that conflict with ES
module grammar, such as using `await` as a variable name. Report the Toss
macro position and advise renaming it. Do not silently fall back to string
evaluation. Property names such as `obj.await` and await inside an async
function remain valid.

Normalize HTML line-comment prefixes only where Acorn recognizes them as
comments. Script-goal parsing previously accepted these comments, while
module-goal parsing rejects them. Preserve source lengths and line breaks;
do not rewrite matching text inside strings, templates or regular expressions.
Validate the normalized evaluator and explicit bindings as module source
before emitting an artifact. The REPL retains its script-goal evaluator.

## Script policy and interactive evaluation

The generated program does not need `unsafe-eval` merely to execute `%js`.
User-written JavaScript that explicitly calls `eval` or `Function` still
follows host policy. Arbitrary host JS remains available; this is not a
security sandbox or an output-capture mechanism.
See [MDN's script-src reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src#unsafe_eval_expressions)
for the host policy on string compilation.

The REPL still compiles submitted strings through its existing evaluator.
It requires a host that permits string compilation, even for cells without
`%js`. Browser-hosted compilation and REPL hosting remain separate work.
