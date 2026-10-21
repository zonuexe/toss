# ADR-35: Symbol identity comparison

Symbols receive `equals:` with a Symbol argument and return a Boolean based
on exact identity. The same interned name compares equal; different names do
not. A Unique symbol compares equal only to itself, including aliases of that
same value. Unique symbols never equal Named symbols. Display labels are not
used in comparison.

A non-Symbol argument is a runtime error at the `equals:` message, matching
the strict same-type approach of Number comparisons in
[ADR-18](0018-numbers-and-booleans.md). Ordinary left-to-right evaluation and
source positions apply. No comparison protocol is added to other types.

Arithmetic `==` and `!=` on fetched Symbol operands use the existing message
lowering to `equals:` and Boolean `not`; no new operator syntax is required.
This adds no Symbol ordering, String conversion, structural equality or
serialization protocol.

```text
#key bind: $Symbol generateUnique.
#alias bind: $key.
($key equals: $alias) print.
#other bind: $Symbol generateUnique.
$($key != $other) print.
```
