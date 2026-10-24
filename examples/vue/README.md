# Vue interop example

This is an ordinary ahead-of-time Toss browser application. Deno compiles
`counter.toss` into a JavaScript ES module that embeds the Toss runtime; the
browser receives that module and static host files. The browser does not run
Deno, Node, the Toss compiler, Acorn, or a Toss source parser. The local fixed-
nonce CSP includes `unsafe-eval` only for the small `%js` registration
expression in the compiled Toss module. Vue uses render functions through `h()`
and needs no template compiler.

## Build and run

From the repository root:

```sh
mise exec -- deno run --allow-read --allow-write examples/vue/build.ts
mise exec -- deno run --allow-read --allow-net=127.0.0.1:8001 examples/vue/server.ts
```

The compiler can also write the Toss module directly with
`mise exec -- deno task compile examples/vue/counter.toss -o out/vue/counter.js`.

Open <http://127.0.0.1:8001/>. The optional server argument selects a port in
the range 1–65535; update the narrow `--allow-net` permission to match. The
server binds to loopback and serves only the generated files under `out/vue`.
The browser needs network access to load the pinned Vue runtime-only production
ES module from unpkg. No Vue template compiler is used.

`counter.toss` defines the increment, reset, and formatting callbacks. Its small
`%js` expression registers them with `bridge.js`, which exposes ordinary
JavaScript functions to Vue. `bridge.js` is a host adapter, not a Toss native
ESM export: Toss `%export` does not create named JavaScript exports. Vue owns
the reactive count and invokes the registered callbacks.

See [the browser verification harness](../browser/README.md) for a separate
example that checks the compiled runtime and browser boundary.

The generated module embeds the Toss runtime, so its output is not optimized for
size. The `/` route serves HTML, and `/app.js`, `/bridge.js`, and `/counter.js`
serve the application modules.
