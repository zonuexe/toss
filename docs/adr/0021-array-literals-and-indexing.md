# ADR-21: Array literals and indexing

An array literal uses square brackets with zero or more comma-separated
expressions. Empty arrays use `[]`. Trailing commas and holes are syntax errors.
Elements are full Toss expressions, evaluated once from left to right. Each
evaluation creates a fresh native JavaScript array, and values are stored by
reference.

Arrays receive `length`, `at:`, and `at:put:`. Indexes must be nonnegative safe
integer Numbers below the current length. Negative zero means index zero.
Reads and writes both check bounds. Writes mutate the array, return the stored
value, and never change its length. Aliases see writes. Arrays cannot be object
keys or indexes.

Array dispatch uses only the explicit array prelude. Native JavaScript methods
and properties are not Toss messages, and unknown messages identify the
receiver as `Array`. Array display, cloning, prototypes, and additional
collection messages are not part of this decision. To show contents, read and
print the elements explicitly.
