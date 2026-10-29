# ADR-53: Browser-compatible REPL session

Expose `createBrowserReplSession` from `src/repl_core.ts` as an asynchronous
session without Deno filesystem or terminal dependencies. Share the REPL
evaluation engine, transactional compilation state and ordered async queue
with the Deno terminal host. Host-specific import resolution stays behind
separate adapters.

The initial browser host supports local macros and JavaScript imports, with an
optional host-provided JavaScript module loader. It reports source-positioned
errors for Toss file and macro-library imports. Reset clears Toss session state
but does not promise to clear the host's JavaScript module cache; a full reload
needs a new host execution context.

Interactive evaluation uses `Function` and `eval`. A browser host must permit
string compilation in its script policy. This is separate from ahead-of-time
compiler output, which does not require implicit string compilation. No browser
REPL UI, Worker lifecycle or file-loading design is introduced in this slice.
ADR-54 adds a separate Worker-based REPL example; ADR-55 adds optional virtual
source maps for Toss file and macro-library imports.
