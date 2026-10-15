# ADR-11: Group one expression with parentheses

Parentheses group one expression and allow its result to receive messages or serve as a keyword-message argument, including nested keyword sends.
A group uses the current environment, allows nesting, and contains no statement terminator; empty groups and groups containing multiple statements are syntax errors.
This makes existing message results composable without adding a scope, a block, or a new runtime operation.

The statement containing the group still requires its final period, and runtime errors retain the locations of the original references and message sends.
This extends the grouping restriction from [ADR-9](0009-file-environment-bindings.md).
