---
status: accepted
---

# ADR-39: Local hygienic expression macros

The user accepted the macro interview through Q20, including the revised
quotation spellings, and confirmed the final summary with "進めて".
Local macros transform source-located token trees into one Toss
expression. Expansion code is Toss, with a separate compile-time Environment.
The model follows ADR-0 and ADR-32 without exposing runtime file bindings to
compile-time execution.

## Definitions and expansion

`%macro(#name, { syntax -> ... }).` is a standalone file-root declaration.
The name is a Named Symbol literal and the expander is a Block with exactly
one parameter. It receives the invocation's unevaluated token tree and must
return a syntax object. The declaration has no runtime value or binding.

Definitions are private to their file and become available after the
declaration, including in later Blocks. Reject nested definitions, duplicate
names and replacement of built-in macros. Cross-file macro publication and
statement-producing macros are deferred. Ordinary Named Symbols keep their
meaning when a macro with the same name is defined.

`%name(...)` requires adjacency before `(`. Capture its body before parsing it
as a normal Toss expression. Initially support existing Toss lexical tokens
and balanced parentheses, brackets and braces. Macro input need not already
be a valid expression. Preserve embedded `%js(...)` source. DSL-specific new
lexical rules remain future work.

Recursively expand macro calls in returned syntax, then require exactly one
valid expression. Introduced macro names resolve where their template was
defined. Spliced macro names keep their original resolution context. Only
macros already defined at that context are available. A macro may refer to
itself in generated syntax. Reject direct self-expansion while preparing its
expander Block. Do not allow references to later macro definitions.

Existing built-ins keep their behavior. Generated expressions may contain
`%js`, `%import`, `%super`, arithmetic and extension forms. Run normal module
analysis on the expanded AST, including imports in unused branches. Host JS
effects and module initialization still happen at runtime. Generated `%macro`
and `%export` declarations are outside this slice.

## Syntax values and quotation

Syntax objects are immutable and retain source and lexical scope information.
Ordinary Arrays can hold syntax objects and use the existing collection
messages. Do not add a separate List type for this slice.

- `%quote(...)` returns its contents literally as syntax.
- A percent sign followed by a backtick and parentheses, `` %`(...) ``, is
  quasiquote. Evaluate unquotes at the corresponding nesting depth.
- `%,(expression)` evaluates a Toss expression and inserts one syntax object.
- `%,@(expression)` evaluates to an Array of syntax objects and inserts them
  in order. An empty Array inserts nothing. Reject other values or elements.

Do not add punctuation during splicing. In particular, callers provide commas
when constructing Array syntax. Spliced objects keep their source and scope.
Unquote forms require a corresponding quasiquote. Do not introduce the
previously proposed `%splice(...)` or `%(...)` spelling.

Syntax messages are:

| Message | Result |
| --- | --- |
| `kind` | `#token` or `#group` |
| `children` | A shallow Array copy of a group's child syntax objects |
| `delimiter` | `'()'`, `'[]'`, `'{}'`, or `''` for a syntax fragment |
| `spelling` | A token's original spelling as a String |

Wrong node kinds are expansion errors. Changing a returned child Array does
not modify its source syntax. Assemble new syntax with quotation and splicing.
Quotation and syntax values are compile-time facilities in this slice;
runtime quotation is deferred.

```text
%macro(#identity, { syntax -> $syntax }).
%macro(#show, { syntax ->
    %`((%,($syntax)) print)
}).

%show(%identity(1 add: 2)).
```

## Compile-time execution

Each expansion starts with a fresh compile-time root Environment and core
Object, Array, Block and value messages, plus syntax APIs. Changes made to
Objects and Arrays do not persist into another expansion. Normal runtime
file bindings are not available to expander code.

Do not provide host output, `%js`, or module loading as compile-time effects.
These forms may occur as unevaluated data in generated runtime syntax.
Bound expansion depth, expansion count and compile-time computation. Exceeding
a limit is a source-positioned compile error. This is a compiler execution
limit, not a special form for stopping recursive expansion.

## Hygiene and method context

Introduced bindings do not collide with caller bindings. Spliced syntax keeps
its original scope. Introduced free references resolve at the definition site.
Named Symbol value identity is unchanged; binding/reference scope is separate
from the value. Definition-site runtime references remain available even
though expansion runs in a separate compile-time Environment.

There is no implicit anaphoric capture. Intentional caller capture requires a
future explicit API. There is also no new form to stop recursive expansion.

Expansion itself adds no method invocation. Generated `%super` uses the method
context at its execution site. Introduced free `$self` follows the same hygiene
as other Fetches and does not implicitly capture the caller. A generated Block
called as a new method receives its own normal invocation context.

## Diagnostics and deferred work

Keep original source positions, including spliced syntax. Add macro definition
positions and invocation traces to diagnostics so expansion paths are visible.
Expansion failures, invalid output, unavailable forms and execution-limit
failures are compile errors. Runtime errors in generated code retain syntax
provenance and the relevant expansion path.

Cross-file macro imports, statement macros, new DSL lexers, runtime quotation,
intentional capture APIs and expansion-stopping forms remain deferred.
