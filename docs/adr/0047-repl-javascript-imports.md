# ADR-47: JavaScript imports in the REPL

Extend ADR-40's `%jsImport('specifier')` to asynchronous REPL evaluation.
Validate and compile the entire cell and Toss dependency graph first. Then
load the collected JS dependencies in source traversal order before any Toss
runtime effects, including dependencies found in unused Blocks. Keep the
file compiler's static ESM output unchanged.

The terminal processes cells and commands in input order. End of input waits
for queued work. A failed JS load reports its specifier, source position and
host error, then later input can continue. It commits no candidate Toss
definitions or module records. Earlier JS dependencies may already have run;
their host effects and module cache cannot be rolled back.

Keep `createReplSession` synchronous for existing callers. Use
`createAsyncReplSession` for JS-dependent evaluation; its submissions and reset
operations are serialized through one queue. Both APIs share compilation and
runtime evaluation. The JS loader can be supplied by the host.

Keep readline line events. During terminal evaluation, pause input and restore
canonical mode so a blocked terminal read cannot delay queued evaluation and
Ctrl-C can reach the signal handler. Restore editing mode at the next prompt.
Do not print a prompt after readline closes. Ctrl-C exits with status 130 even
when a JS dependency has pending asynchronous work.

Successful loading commits the cell's compilation state before evaluation.
JS namespace values use the existing opaque reference conversion and identity
rules. Runtime and display failures retain already committed state.

Keep host module resolution and permissions. `:reset` clears Toss bindings,
macros, module initialization state and JS reference wrappers. It does not
clear the host's JS module cache. The user accepts clearing the whole session
when reloading JS: restart the REPL process to create a fresh JS execution
context. Re-downloading changed remote source is a separate host cache policy.
Do not append cache-busting queries: that can leave transitive dependencies
cached and mix references from different module instances.

A future browser session can use a fresh Worker for the same full-session
reload boundary. Browser support and an automatic restart command remain
separate work. Root await and implicit Promise waiting remain deferred.
