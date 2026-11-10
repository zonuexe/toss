# Browser runtime compatibility

## 0.0.1 release status

The supported compiler host for this development milestone is Deno 2.9.7 on
macOS. Generated JavaScript targets browser ESM, but there is no verified
Chromium/Firefox/Safari support matrix for 0.0.1. Node.js is not a promised
runtime. Browser-hosted compilation and REPL applications remain examples.
See the [release contract](release-contract.md).

The observations below describe earlier example checks. They lack a recorded
browser version and are historical notes, not fresh 0.0.1 release evidence.
Release verification must record the exact browser and OS version and the
tested source commit. A WebKit test alone does not establish Safari support.

Start with JavaScript compiled by Deno and executed as a browser ES module.
Running the compiler or REPL inside the browser is a larger, separate task.
The [browser example](../examples/browser/README.md) implements this first
step. The checks below passed in the Codex in-app browser. This verifies a
small execution subset, not a supported-browser matrix or a browser compiler.

## Historical example observations

The examples have different purposes:

- [`examples/browser`](../examples/browser/README.md) is a compatibility test
  harness with explicit checks and a separate strict-CSP route.
- [`examples/vue`](../examples/vue/README.md) is a small application using
  ordinary browser ES modules. Vue owns reactive state and rendering, and
  calls Toss Blocks through an explicit callback adapter. With `--format esm`,
  Toss's single `%export` value becomes a JS default export; no named JS
  export syntax is added.
- [`examples/browser-compiler`](../examples/browser-compiler/README.md)
  bundles the source compiler and lets a browser compile editable virtual
  source files or locally selected Toss files, then display or download the
  generated JavaScript. It does not execute that JavaScript.
- [`examples/browser-repl`](../examples/browser-repl/README.md) evaluates
  cells in a Worker and separates Toss session reset from Worker replacement.

The first two use Deno to compile before deployment. The generated JS embeds the Toss
runtime and prelude by default. The Vue build selects a separate runtime
module under ADR-50. Neither form is tree-shaken. Neither requires Deno or Acorn
in the browser, and neither implements browser-hosted compilation.

### Runtime verification

The main page uses a document import map for a local JavaScript host module.
It checks arithmetic, Array mapping, a private Toss module closure, repeated
JS namespace identity, a synchronous callback and an Async Block awaiting a
JavaScript Promise. All six checks passed. Mouse and keyboard activation of
the native button also invoked the Toss callback with increasing inputs and
displayed matching results.

The separate `/strict` page uses `script-src 'self'` without `unsafe-eval`.
Plain Toss printed `42`, ahead-of-time `%js` printed `2`, and an explicit
user-written `Function` constructor failed with a CSP `EvalError`. All three
checks passed. ADR-49 compiles ordinary JS expressions as native functions.
The main page also omits `unsafe-eval`; its six checks and button callback
passed after rebuilding with the native evaluator path.

The browser did not expose its engine version through the available tooling.
Other browsers and Workers were not tested.
Build, host status handling and HTTP asset routing also have
automated regression tests in `tests/browser_example_test.ts`.

### Source compiler smoke test

A separate temporary smoke test bundled `src/source_compiler.ts` and Acorn
with `deno bundle --platform browser --format esm`. In the Codex in-app
browser, it compiled a source string containing a local macro and imported the
resulting ES module from a Blob URL; its default export was `42`. The test
used a policy allowing scripts from the local server and `blob:`, without
`unsafe-eval`. The bundled compiler ran without Deno or Node APIs. This is
one browser smoke test, not a browser REPL or a file-loading implementation.

The separate browser-compiler example makes source compilation repeatable.
Its script policy uses `script-src 'self'` without `unsafe-eval`. It displays
the output without running it and uses a Blob URL when the user downloads it.
In the Codex in-app browser, the two-file example compiled a local module
import, reported a missing source and cleared stale output, then successfully
compiled a shared macro library after the inputs were corrected.
The browser also downloaded a generated `main.mjs`; importing the downloaded
file in Deno produced the expected default value `42`. Editing a source
disabled the download until the next successful compilation.
A browser test also selected a local `extra.toss` file and observed its source
appear in the virtual file list; the later helper extraction was covered by
automated tests and a fresh browser startup and compilation check.

### Vue application

The Vue counter also ran in the Codex in-app browser. Vue 3.5.13 loaded from
unpkg as a runtime-only production ES module. Incrementing twice changed
`0` to `1` to `2`; reset returned `0`, and increment worked again afterward.
Vue owns the reactive Number and rendering. The generated Toss callbacks
implement increment, reset and formatting. The initial example used a
module-scoped JS registration bridge; ADR-48 replaces it with a default import
of the generated ES module's public value.

When a temporary test server returned 404 for the application module, the
page displayed a startup error and retained the static count and disabled
controls. Automated tests also execute the generated callbacks in a Deno
subprocess, without downloading Vue, and check missing initialization and
asset routing. Vue's render function uses no template compiler. The Toss
public-object expression is compiled ahead of time under ADR-49. Increment
and reset also passed after removing `unsafe-eval` from the Vue script policy.

The ADR-50 build emits `counter.js` and a separate `runtime.js`. The same
browser verified `0` to `1`, reset to `0`, and another increment to `1`
with this build. The generated counter was 5,897 bytes, compared with 28,737
bytes when embedding the runtime; the reusable runtime asset was 23,446 bytes.
These are uncompressed sizes for this example, not a tree-shaking result.

## Current boundaries

| Area | Observed implementation | Browser work |
| --- | --- | --- |
| Generated program | `src/codegen.ts` embeds the runtime by default, with an optional external runtime import, and emits static JS namespace imports. | Load the artifact as an ES module with browser-compatible dependencies. The compiler need not run in the browser. |
| Runtime values and async Blocks | `src/runtime.ts` and `src/runtime_async.ts` use JavaScript objects, collections and Promises. | The example verifies a small subset in a real browser; broader coverage remains open. |
| Output | `writeOutput` in `src/runtime.ts` uses `console.log`. | Initial output can use the browser console. A playground needs a separate output design. |
| JS expressions | Ahead-of-time output embeds native evaluator functions outside the runtime scope. The REPL retains its string evaluator. | Ordinary compiled `%js` needs no implicit string compilation. Explicit user eval/Function still follows host policy. |
| Compiler entry | `src/source_compiler.ts` compiles a source string or a host-provided map of virtual sources without filesystem services. `src/compiler.ts` also exports `compileFile`, which uses `node:path` and Deno filesystem services. | Bundle or resolve the pure entry and its parser dependency for the browser. The host supplies source and macro library strings. |
| Parser dependency | Acorn is mapped to an npm package in `deno.json`. | Bundle or provide a browser-resolvable Acorn artifact for browser-hosted compilation. Generated programs do not need this compiler dependency. |
| REPL runtime | `src/repl_runtime.ts` uses `Function` and direct `eval`. | Every interactive session needs string compilation, including cells without `%js`. |
| REPL host | `src/repl_core.ts` provides a browser-compatible asynchronous session sharing the terminal evaluator. A host-supplied virtual source map resolves Toss and macro-library imports; the Deno host resolves them from disk. | Browser hosts supply source strings and decide how to edit or load them. |
| JS loader | `loadJavaScriptModule` is injectable in the session options. | The browser host can provide resolution; module caching and permissions remain host policy. |

## Module resolution

Keep ADR-40's host-owned resolution. A browser document can map bare package
names through an import map. Do not assume `node:`, `npm:` or `jsr:` have their
Deno meanings in a browser. Use browser-compatible artifacts and explicit
URLs or mappings. Relative `%jsImport` specifiers remain outside Toss's
current grammar.

Document import maps apply to static and dynamic module imports in documents,
but not to modules inside Workers or worklets. A Worker needs resolvable URLs
or bundling throughout its dependency graph; rewriting only a root specifier
does not resolve bare imports inside its dependencies.
[MDN import maps](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap)

## Script policy and execution context

A script policy can block `eval` and `Function`. Under ADR-49, ahead-of-time
programs execute native functions for `%js` and do not implicitly invoke those
string compilers. User JS can still request them explicitly and is subject
to host policy. The current REPL evaluates submitted strings, so moving it
into a Worker does not remove the need to address string compilation.
[MDN script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)

A temporary browser smoke test bundled `src/repl_core.ts` and Acorn and used
`script-src 'self' 'unsafe-eval'`. It verified persistent bindings, a local
macro, recovery after an error, an injected JS module loader and reset. This
checks the session API in one browser; it is not a browser REPL interface or
a Worker-based reload implementation.

The separate Worker REPL example was also exercised in the Codex in-app
browser. A binding and later message returned `42`; `print` appeared before
the inspected result. After a normal reset, the JS fixture retained its
Worker state. Replacing the Worker created a fresh JS module context. The
example permits `unsafe-eval` in the Worker policy, not the page policy.
With its built-in virtual source map, the browser also imported a Toss module
and a macro library, reported a missing file and continued after that error.

A DOM-integrated page and a Worker playground are different targets. Worker
messages cannot clone functions, Symbols or DOM nodes, and do not preserve
arbitrary prototype chains. Keep live Toss values, Blocks, callback adapters
and opaque JS references inside their executing context. A future playground
can send display strings, diagnostics and explicitly serializable data to its
UI; direct DOM operations need a separate host design.
[MDN structured clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)

## Reset and full reload

ADR-47 separates Toss reset from JS reload. The user accepts losing the whole
session when JS is reloaded. Browser module maps belong to a Document or
Worker, so replacing a Worker is a suitable proposed execution boundary.
It does not guarantee fresh network bytes: HTTP caching is separate. Avoid
individual cache-busting imports that can mix new instances with cached
transitive dependencies.
[HTML module maps](https://html.spec.whatwg.org/multipage/webappapis.html#module-map),
[MDN dynamic import](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import)

## Possible next steps

The ahead-of-time, browser compiler and browser REPL examples exist. The source
compiler entry is separate from filesystem services. Hosts must bundle or resolve
its parser dependency and supply a virtual source map. The browser REPL example
provides a Worker boundary for full JS reload and requires string evaluation.

Supported browsers, a production script policy, and the choice of DOM page
versus Worker playground remain product decisions for later work. These examples
do not establish a supported browser-hosted compiler or REPL product.
