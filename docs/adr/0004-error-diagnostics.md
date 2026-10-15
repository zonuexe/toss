# ADR-4: Report errors at Toss source locations

Report syntax errors during compilation and unknown messages at runtime, with the source file name, line, column, and reason.
For an unknown message, include its name and the location of the message send in the Toss source rather than the generated JavaScript location.
Compilation or execution that fails must exit with a nonzero status.
