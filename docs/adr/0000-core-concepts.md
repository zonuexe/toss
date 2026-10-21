# ADR-0: Core concepts of Toss

Toss adopts dictionaries as its object model and message passing as its model of computation, drawing on Smalltalk, Lisp, and JavaScript.
Its core syntax has five forms: unary messages, keyword messages, blocks, macros, and pipelines; declarations and control flow use messages and hygienic macros instead of reserved keywords.
This keeps the language core small while allowing programs to define richer behavior through objects and macros.

## Design commitments

- **Objects and delegation:** Objects are dictionaries of slots. New objects clone and extend existing ones, and unknown messages delegate to the prototype. `$self` refers to the receiver.
- **Messages and blocks:** Blocks are closures used for deferred work, control flow, and effect handlers. Binary expressions use the built-in `$()` macro rather than a separate core operator syntax.
- **Environments:** Scopes are dictionaries. `$name` fetches a value, and `#name bind:` binds one. Each file has its own environment and publishes values through module exports.
- **Syntax and data flow:** A period explicitly ends a statement, with no automatic insertion. `|>` passes its left-hand result as the final argument of the next keyword message.
- **Symbols, macros, and annotations:** `#name` is a runtime Symbol, `%name` explicitly invokes a named compiler Macro, and `@name` is reserved for call-related Annotations. Annotation declarations may select runtime invocation or compile-time expansion. Attribute representation is deferred. See [ADR-32](0032-macro-and-annotation-sigils.md).
- **JavaScript target:** Toss targets direct translation to modern JavaScript for Node.js and Deno, with JavaScript interoperability and hygienic binding of `$self`.
- **Effects and types:** Blocks, dictionaries, and messages express algebraic effect handling, including resumption and cleanup. Optional type annotations provide compile-time metadata for inference and editor tools.

## Consequences

Language features should build on these forms and conventions rather than add reserved keywords or class syntax.
Direct translation and zero runtime overhead are design goals; their feasibility, especially for resumable effects, still needs implementation evidence.
This ADR records the documented direction, not a complete grammar or a verified implementation.

## Sources

- [README](../../README.md)
- [Language tour](../tour.md)
