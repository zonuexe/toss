# ADR-45: Macro library imports in a REPL session

Extend ADR-43's explicit `%macroImport('./macros.toss').` to the REPL so shared
macros can be tried without compiling a consumer file. Keep the existing
macro-library grammar and hygiene. The user chose once-only session loading,
atomic failures and reset-based reloading before runtime module imports.

Resolve literal relative `.toss` paths from the session's startup directory.
Capture this base once; changing the host working directory or using `:reset`
does not change it. Only standalone cell-root directives load files. Imported
definitions become visible after that source position, in the same cell or
later cells. Import-only cells produce no result display. Preserve canonical
library source positions, helper lookup and expansion traces. Runtime free
references use the consuming session's Environment.

Each session tracks canonical library paths independently. Repeated imports,
including path aliases, are idempotent and do not reload edited source.
Conflicting names still fail. `:reset` clears runtime state, local and imported
definitions and the import cache, so a later import reads the library again.

Compile with a candidate registry and import cache. A missing or invalid
library, name collision, expansion error or invalid cell commits neither
candidate and executes no cell effects. A corrected file can be retried.
Successful compilation commits both before runtime evaluation; later runtime
or display failures retain the imports, as ADR-44 retains local macros.

Libraries still contain only macro declarations. Nested and macro-generated
import directives are rejected before dependency loading. Unused quoted
directives remain inert syntax data. ADR-46 adds runtime module imports.
Static JS imports, cell exports, imports between macro libraries and root
await remain deferred.

Use synchronous file loading within the synchronous REPL submission boundary.
Expected filesystem and permission errors become recoverable diagnostics;
unexpected failures propagate. The Deno host's normal read permissions apply.
