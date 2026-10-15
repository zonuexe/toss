# ADR-10: Separate display output from debug output

Use `print` for normal display and `dump` for a representation that makes the value's type and boundaries clear.
Both messages write a trailing newline and return the original receiver, preserving their use for debugging within a message chain.
For named symbols, normal display uses the name alone and debug output includes the leading `#`; this replaces the symbol `print` format originally recorded in [ADR-9](0009-file-environment-bindings.md).

Provide `toString` and `inspect` as string conversion messages in this implementation step.
For strings, `toString` returns the receiver and `inspect` returns its JSON string representation, with double quotes and escaped control characters and backslashes.
For named symbols, `toString` returns the name and `inspect` returns `#` followed by the name.

`print` sends `toString` to its receiver and `dump` sends `inspect`, then each writes the resulting string with a newline and returns the original receiver.
If a conversion message returns a value other than a string, raise a runtime error rather than silently coercing it.
Debug representations are not guaranteed to be valid Toss source; double-quoted string literals remain deferred.

`dumpSlots`, `dumpStructure`, `dumpInternals`, and `describe` are possible names for future object exploration operations, not committed APIs.

## Deferred: output buffering and JavaScript interop

Output buffering is outside this implementation step.
Possible approaches include an output object selected through shadowing or a dynamic context, and output handled as an effect; no approach is selected yet.
Future design work must define whether capture includes output from called code and native JavaScript APIs such as `console.log`, as well as nesting and restoration after errors.
Native JavaScript output is not assumed to be captured by Toss output handling.
