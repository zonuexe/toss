# ADR-43: Explicit macro library imports

The user approved explicit macro imports to separate Hono adapters and shared
macros from user applications. Add `%macroImport('./macros.toss').` as a
standalone file-root declaration. This extends ADR-39's file-private macros
without coupling compile-time definitions to runtime module initialization.

A macro library contains only `%macro` declarations. Import all its definitions
at the directive's source position; no implicit export from ordinary runtime
modules. Require one literal relative `.toss` path, resolved from the importing
file. `compileFile` loads the source; synchronous `compile` reports that a file
compiler is required. Do not run runtime statements or JS while loading macros.

Each consumer instantiates its own macro context. A library has no runtime
Environment to capture: generated runtime free references use the consumer's
file root, while spliced syntax retains caller scope. Pass runtime dependencies
such as a Hono adapter or app explicitly. Keep library source positions and
definition/invocation traces. Earlier helper macros in a library remain visible
to its templates; later definitions and consumer-only macros do not leak into
that template context.

Repeated imports of one canonical library in a consumer are idempotent.
Conflicting names from local definitions or different libraries are errors;
built-ins cannot be replaced. Libraries are compile-time dependencies and
cannot be overwritten by compiler output. Reject nested or generated import
directives. Unused quoted imports remain inert syntax data.

For this first slice, macro libraries cannot import other macro libraries.
Selective imports, aliases, private helper exports and runtime bindings in
macro libraries are deferred. Generated runtime `%import` expressions retain
the existing consumer-relative resolution; macros should receive runtime
dependencies through their input rather than hide an import path.
