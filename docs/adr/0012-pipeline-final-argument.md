# ADR-12: Pass pipeline results as the final argument

`|>` evaluates its left expression once and supplies the result as the omitted final argument of the keyword message on its right.
Pipelines associate left to right and bind less tightly than unary and keyword messages; parentheses can group a complete pipeline or its receiver and arguments.
Evaluate the left expression first, then the right receiver, then explicit arguments in source order, and return the message result.

The right side must have exactly its final argument omitted.
A unary-only right side, a fully supplied keyword message, or a missing earlier argument is a syntax error.
Only `bind:` is currently provided as a keyword message; other valid selectors still fail at runtime after their arguments are evaluated.

This extends the pipeline restriction from [ADR-9](0009-file-environment-bindings.md).

[ADR-28](0028-extend-macro.md) adds `%extend(...)` as a built-in pipeline macro
alongside keyword-message stages.
