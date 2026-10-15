# ADR-6: Keep single-quoted string escapes minimal

Single-quoted strings decode only `\\` as a backslash and `\'` as a single quote; all other backslashes remain literal, so `\n`, `\r`, and `\t` are not control-character escapes.
This keeps the rules compact, like PHP single-quoted strings; control characters may be represented directly in literals or through a future double-quoted string form, whose rules are not yet defined.
Literal tabs and line breaks are allowed and preserved without indentation stripping; see [ADR-7](0007-literal-characters-and-compiler-interface.md).
