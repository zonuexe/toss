# ADR-46: Local modules in a persistent REPL session

Extend ADR-37's `%import('./file.toss')` to REPL expressions. Keep one shared
runtime and private module Environments so exported values and Blocks behave
the same in compiled programs and interactive input. REPL paths use the captured
startup directory; dependencies use their importing file's directory.

Compile the whole dependency graph before running any cell effects, including
imports inside unused Blocks. Each imported file needs one top-level export.
Reject cycles and preserve file positions in diagnostics. Modules compile with
their own macro context and may load file-relative macro libraries; session
macro definitions do not become module definitions.

Keep canonical source and compilation records for the session. Successful
compilation commits new module records together with the cell's macro state.
A failed compilation commits none of them, so corrected files can be retried.
Register initializers before cell execution, then initialize lazily on the
first executed import. Cache the exported value or initialization failure
across later cells. Do not replay earlier cells or effects.

Edits to a successfully compiled module take effect after `:reset`, even if
the earlier import has not executed yet. Reset clears module records,
initialization results and macro state, while keeping the startup directory.
Ordinary input and reset require no source-file reads. Expected filesystem
errors are recoverable diagnostics under the host's read permissions.

Keep the synchronous session API. ADR-47 adds asynchronous evaluation for
`%jsImport`, including within imported Toss files, while preserving ordered
terminal input. A REPL cell cannot export a module value. Ordinary `%js`
remains available.
