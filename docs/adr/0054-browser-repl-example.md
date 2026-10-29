# ADR-54: Browser REPL example in a Worker

Provide a separate browser REPL example backed by `createBrowserReplSession`.
Evaluate cells in a same-origin module Worker and display Toss output, results
and diagnostics as text. The host output callback reports `print` and `dump`
without changing the default terminal output or intercepting JavaScript's
native console. This is a host integration, not a Toss output-buffering API.

Reset clears the Toss session within the same Worker. Reloading JavaScript
modules replaces the Worker and starts a fresh session and JS module map;
network caches remain host-controlled. Ignore responses from replaced Workers.
The Worker is not a security sandbox for arbitrary JavaScript.

The page has a strict script policy, while the Worker permits `unsafe-eval`
for interactive evaluation. Toss file imports and macro-library imports remain
unsupported in the initial browser REPL host; ADR-55 adds a host-provided
virtual source map. JavaScript import specifiers use the existing `%jsImport`
rules and must resolve in the Worker environment.
