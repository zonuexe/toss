# Browser REPL example

This page evaluates stateful Toss cells in a same-origin module Worker. Toss
`print` and `dump` output, automatic cell results, and source diagnostics appear
as separate transcript entries. **Reset session** clears Toss bindings and
macros and refreshes cached Toss imports from the current virtual files while
keeping the Worker’s JavaScript module cache. **Reload JavaScript modules**
replaces the Worker and starts a new Toss session and module cache; edits in the
page remain in place and are copied into the replacement Worker.

The main page does not evaluate Toss. Its CSP permits scripts and Workers only
from this origin and disallows network connections. The Worker has its own CSP
that permits `'unsafe-eval'` for the REPL runtime’s `Function` and `eval`; the
main page does not permit string compilation. A Worker keeps evaluation off the
page thread and separates its globals from the page, but it is not a security
sandbox for arbitrary `%js`.

Local `%macro` declarations and `%jsImport` are supported. `%import` and
`%macroImport` read only the editable virtual source map shown on the page; it
starts with `math.toss` (40 + 2) and `macros.toss` (an `#answer` macro). Editing
a file updates the Worker’s source map but does not initialize or reset the
session. An already imported Toss module or macro library remains cached with
its old source until **Reset session**. Reset applies the current files and
clears Toss state and Toss import caches, while preserving the Worker’s
JavaScript module cache. **Reload JavaScript modules** replaces the Worker and
copies the current edits into the fresh session. Browser hosts can supply their
own sources using `createBrowserReplSession({ sources })`. No Toss source files
are fetched or read from disk. JavaScript import specifiers must be allowed by
the Worker CSP. The REPL accepts bare specifiers and absolute URLs; it rejects
relative paths. Bare specifiers do not inherit the page’s import map. The served
`demo-module.js` is a same-origin absolute-URL fixture. Try:

```toss
#demo bind: %jsImport('http://127.0.0.1:8010/demo-module.js').
%js(module = $demo; module.answer) print.
```

The URL uses the default server port; change it to match a custom port. The
module stays cached by the Worker when you reset the Toss session. Use **Reload
JavaScript modules** to create a new Worker and load it again. JavaScript module
`console` output remains in the Worker console, separate from Toss
`print`/`dump` transcript output. The page retains the latest 200 transcript
entries and does not persist source or session state. If the browser restores
this page from its back-forward cache, it starts a fresh Worker and resets both
Toss state and the JavaScript module cache.

Build the browser module and serve the example on loopback:

```sh
deno run --allow-read --allow-write --allow-run=deno examples/browser-repl/build.ts
deno run --allow-read=out/browser-repl --allow-net=127.0.0.1:8010 examples/browser-repl/server.ts
```

Open <http://127.0.0.1:8010>. The first build may download Deno’s bundler
dependency. Toss evaluation and JavaScript module loading happen in the Worker;
the page only sends source text and displays results.
