# ADR-14: Call blocks with repeated value keywords

Allow comma-separated block parameters and call a block with one `value:` keyword part per argument, such as `value:value:` for two arguments.
Parameters must have distinct case-sensitive names, and a trailing comma is a syntax error.
Arguments are evaluated from left to right, the argument count must match exactly at runtime, and the existing lexical environment and last-expression return rules continue to apply.

There is no fixed language-level parameter count in this step; repeated `value:` selectors use the same block invocation behavior.
`value` remains the zero-argument call, while mixed selectors such as `value:with:` remain unknown messages.
Pipelines can supply the final argument to a multi-argument block call without changing their evaluation order.

This extends the parameter-count restriction from [ADR-13](0013-blocks-and-lexical-environments.md).
