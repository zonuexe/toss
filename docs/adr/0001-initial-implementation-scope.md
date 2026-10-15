# ADR-1: Start small and allow runtime support

Start the implementation with a simple, minimal executable case and add language features in later steps; effects are deferred.
Runtime support is allowed, so literal one-to-one translation to JavaScript is not a requirement.
Use JavaScript values directly, including strings and arrays, with Toss message rules: "everything is a dictionary" describes the common object model, not a requirement to wrap every value in a dedicated dictionary object.

This refines the JavaScript translation goal in [ADR-0](0000-core-concepts.md).
The first program and its semantics are defined in [ADR-2](0002-first-executable-case-and-prelude.md), [ADR-3](0003-print-prelude-and-terminators.md), and [ADR-8](0008-minimal-syntax-and-lexical-rules.md).
