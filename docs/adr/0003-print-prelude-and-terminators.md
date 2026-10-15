# ADR-3: Print behavior, prelude loading, and statement terminators

`print` writes its string receiver to standard output with a trailing newline and returns the receiver, so `'Hello' print print.` prints two lines.
Returning the receiver supports `tee`-like debugging: a program can print an intermediate value and continue sending messages to that value.
Returning Unit was considered, but preserving the receiver is preferred for now; this does not decide whether the language will have a Unit or null value.
The standard prelude is available without an explicit import; its message implementations should be independently referenceable for future tree-shaking, but tree-shaking is not required in the initial implementation.
Top-level statements require a final period; the last expression in a block may omit it, preserving the examples in the language tour.

Block implementation remains outside the first executable case.
