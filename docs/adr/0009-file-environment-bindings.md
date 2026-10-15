# ADR-9: File environment bindings

The next executable case is `#greeting bind: 'Hello, Toss!'. $greeting print.`: add named symbols, environment references, and the `bind:` keyword message to the first implementation.
Each file has its own environment dictionary; binding an existing name replaces its value, and fetching an unbound name raises a runtime error containing the name and its Toss source location.
Blocks and pipelines remain outside this implementation step.

`bind:` returns the value it stores.
Unary messages bind more tightly than keyword messages, so `#greeting bind: 'Hello' print.` prints the string before binding the result.
Symbols are ordinary values: `#key bind: #greeting. $key bind: 'Hello'.` binds `greeting` through the symbol stored in `key`.

Keyword-message syntax supports multiple arguments: `at: 'key' put: 'value'` forms one message named `at:put:` with two arguments.
Each argument is a value followed by zero or more unary messages; grouping parentheses and nested keyword sends remain deferred.
Only `bind:` is implemented as a keyword message in this step; other valid keyword messages fail at runtime.

Symbols support `print`, which writes the symbol name and a newline, then returns the symbol itself. Debug output includes the leading `#`; see [ADR-10](0010-display-and-debug-output.md).
Named symbols are interned: the same name identifies the same symbol within one execution, independently of the environment that holds its binding.
String-to-symbol and symbol-to-name conversion messages are deferred; their names and handling of arbitrary strings are not yet specified.
Interning does not merge file environments or share their bindings.
