# ADR-17: Nil and empty blocks

Use JavaScript `null` as Toss's single absent-result value, named `Nil` through
an ordinary root binding. The binding may be shadowed. Nil receives `toString`
and `inspect` as `"nil"`; `print` and `dump` write through the existing output
path and return Nil. Other messages fail with type name `Nil` at the message
location.

Blocks may have an empty body, including parameterized blocks. Calling one with
the exact required arity returns Nil. Nonempty blocks continue to return their
last expression. Empty groups remain syntax errors, and a period cannot stand
alone as an expression.

Object slots may contain Nil. Slot presence is determined independently from
the stored value, so reading a present Nil slot succeeds while a missing slot
fails. Nil is not a valid slot key. This decision adds no equality,
truthiness, conditional, or default object display behavior.
