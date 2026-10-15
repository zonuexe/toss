# ADR-8: Minimal syntax and lexical rules

The first implementation accepts string expressions, unary message chains, and multiple statements evaluated in source order; a string expression alone produces no output, and an empty file succeeds.
Outside strings, spaces, tabs, and line breaks separate tokens, `//` starts a line comment, and only an explicit period ends a top-level statement.
Unary message names are case-sensitive and match `[A-Za-z_][A-Za-z0-9_]*`; `print` is an ordinary message name, and an unknown message fails at runtime.

Variables, numbers, grouping parentheses, blocks, block comments, and Unicode message names are outside this first implementation and must produce compile errors when used as syntax.
Message names inside comments or strings are not interpreted as syntax.
The result of a message chain depends on each prelude message's return value; `print` returns its receiver as defined in [ADR-3](0003-print-prelude-and-terminators.md).
