# Toss browser verification

This directory is a verification harness with PASS/FAIL checks. For a small
application that uses compiled Toss from Vue, see the
[Vue counter](../vue/README.md). Both run ahead-of-time JavaScript; neither runs
the Toss compiler or REPL in the browser.

This small harness verifies JavaScript emitted ahead of time by Deno. The
browser only receives static ES modules and local host assets; it does not run
Deno, Node, the Toss compiler, or Acorn. Compiled `%js` expressions are
ahead-of-time JavaScript, so the main and strict pages do not allow
`unsafe-eval`.

## Build and serve

From the repository root:

```sh
mise exec -- deno run --allow-read --allow-write examples/browser/build.ts
mise exec -- deno run --allow-read --allow-net=127.0.0.1:8000 examples/browser/server.ts
```

Open <http://127.0.0.1:8000/>. The optional server argument selects a port in
the range 1–65535; update the narrow `--allow-net` permission to match it. The
server binds only to loopback and serves only the generated files under
`out/browser`. Routes are `/`, `/strict`, `/main.js`, `/strict.js`, `/aot.js`,
`/blocked.js`, `/host.js`, and `/strict-host.js`.

The main page checks arithmetic, Array mapping, a private Toss module closure,
repeated namespace identity through the local `browser-demo` import map,
JavaScript invocation of a synchronous Toss callback, and a Toss Async Block
awaiting a JavaScript Promise. Click **Run Toss callback again** to invoke that
callback from the browser again; each click passes a larger input and displays
the expected and observed result. Callback errors appear as visible failures.

Open `/strict` for checks under `script-src 'self'`. A plain Toss program must
print `42`, an AOT `%js` expression must print `2`, and an explicit user call to
the JavaScript `Function` constructor must be blocked by CSP.

## Checks

```sh
mise exec -- deno test --allow-read --allow-write --allow-run=deno tests/browser_example_test.ts
mise exec -- deno check examples/browser/*.ts tests/browser_example_test.ts
mise exec -- deno fmt --check examples/browser/*.ts tests/browser_example_test.ts examples/browser/*.js examples/browser/*.html examples/browser/*.md
mise exec -- deno lint examples/browser/*.ts tests/browser_example_test.ts examples/browser/*.js
```

The tests build into temporary directories and call the exported Request handler
directly, so they do not open a network socket.
