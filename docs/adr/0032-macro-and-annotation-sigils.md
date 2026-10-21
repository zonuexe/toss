# ADR-32: Separate symbols, macros, and annotations

Use `#name` for a Named symbol, `%name` for an explicit named compiler Macro,
and `@name` for an Annotation. This keeps runtime values separate from syntax
expansion, especially when future statement macros omit parentheses. Parsing
a Symbol must not change when a macro with the same name becomes available.

`$name` remains a Fetch and `$()` remains the dedicated arithmetic macro.
Inside arithmetic syntax, `%` remains the remainder operator. The prefix of
a named macro and the arithmetic operator have separate grammatical roles.

## Named macros

The implemented Object extension opener changes from `#extend(` to
`%extend(`, with no whitespace before `(` and no compatibility alias.
All evaluation, scope, hygiene, pipeline and source-location rules in
[ADR-28](0028-extend-macro.md), [ADR-29](0029-extend-string-keys.md), and
[ADR-30](0030-extend-dynamic-keys.md) remain unchanged. Their examples use the
new spelling. `#extend` is always a Named symbol, like `#import` or `#const`;
it no longer starts a macro before a parenthesis.

The planned general forms are `%name(...)` for delimited macro input and
`%name ... .` at statement start for input ending at a period outside nested
delimiters. These are design directions, not a general macro implementation.
`%import`, `%let`, `%const`, `%regex` and `%super` remain unimplemented.
Unknown or unsupported macro invocations are compilation errors; they never
fall back to runtime Symbols. Macro definition, import and expansion APIs
remain future decisions.

## Annotations and attributes

An Annotation participates in invocation behavior. The `@name` prefix is
reserved for its future application syntax. Its declaration determines
whether it uses runtime calls or compile-time expansion. A compiler-known
declaration can expand an Annotation without emitting a call to the
Annotation itself. Expansion can still generate runtime checks or other
work; it does not promise zero runtime cost. Ordinary runtime bindings alone
cannot supply the compiler with an expansion rule.

Annotations and explicit Macros may share expansion machinery while keeping
different application syntax. Annotation declarations, targets, argument
syntax, composition and lookup rules are not specified or implemented here.

An Attribute represents attached data and does not itself require invocation
interception. Its representation, attachment, access and lifetime are deferred.
No Attribute sigil or surface syntax is selected, and `@name` is not assigned
to Attributes by this decision. Optional colon type annotations are a separate
future facility; this decision does not define their relationship to
`@name`.

## Alternatives

Keeping `#` for both values and named macros needs more disambiguation once
statement macros are introduced. `@` would also work as a macro prefix, but
is reserved for call-related Annotations. `!` remains unassigned. Separate
prefixes add punctuation but make the intended language phase visible.
