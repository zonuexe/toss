# ADR-50: External runtime module

Allow ahead-of-time artifacts to import a generated ES module containing the
Toss runtime and prelude. Embedded output remains the default. A separate
runtime asset lets several compiled files reuse the same code through the
host's module loader.

The runtime module exports a factory. Each compiled artifact creates its own
runtime instance, preserving its private message tables, callback adapters
and reference caches. File Environments and Toss module initialization also
remain private to that artifact. Sharing a runtime asset does not create a
shared Toss session or add cross-artifact Toss value interoperability.

`generateRuntimeModule()` returns the asset source. `deno task runtime -o
<path>` writes it, and `--runtime-import <specifier>` selects it when compiling
an application. The API option is `runtimeImport`. The specifier is emitted
as a static ES module import and resolved by the host relative to the generated
application. Generate the runtime and applications with the same compiler
version. The runtime factory interface is internal to generated code.

Newly compiled applications check a fingerprint of the generated runtime
before starting the Toss entry. A missing or different fingerprint, or a
missing runtime factory, reports that the runtime should be regenerated with
the application. The fingerprint identifies the runtime build; it is not an
integrity or security check. Applications compiled before this check do not
perform it. JavaScript imports still initialize according to host ES module
rules before the generated application runs.

The asset contains no compiler or REPL and needs no Deno services or implicit
string evaluation. Native `%js` evaluators retain ADR-49's lexical isolation.
This asset shares the complete runtime code. ADR-51 adds optional prelude
tree-shaking for embedded output.
