# ADR-13: Blocks capture lexical environments

Support nonempty blocks with zero or one parameter, evaluated only through `value` or `value:` and returning the last expression's value.
Blocks capture their defining environment by reference, so later changes to an outer binding are visible, and each invocation creates a fresh local environment whose parent is the captured environment.
`bind:` writes to the current environment while fetch searches outward for the nearest binding, keeping local rebinding separate from outer state.

## Syntax and errors

Use `{ expression }` or `{ name -> expression }`; parameter references use `$name`.
Periods separate body expressions, and the last period before `}` is optional.
Nested blocks can outlive the call that created them and keep access to that call's local bindings.

Wrong argument counts fail at the call's Toss source location; errors inside a body use that body's source locations.
Empty blocks are syntax errors in this version because a value for an empty result has not been defined.
Multiple parameters, nonlocal returns, and method receiver binding remain deferred; the block messages provided in this step are `value` and `value:`.

This extends the block restriction from [ADR-9](0009-file-environment-bindings.md).
