# ADR-2: First executable case and prelude library

The first executable case is `'Hello, Toss!' print.`: a string literal, a unary message, and an explicit statement terminator, producing one line on standard output.
Provide `print` through a prelude library, and structure the library to support tree-shaking in the future.
Sending an unknown message raises a runtime error.

Automatic prelude loading and the return value of `print` are defined in [ADR-3](0003-print-prelude-and-terminators.md), and error diagnostics are defined in [ADR-4](0004-error-diagnostics.md).
The first implementation provides `print` for strings; other syntactically valid message names fail at runtime, as defined in [ADR-8](0008-minimal-syntax-and-lexical-rules.md).
