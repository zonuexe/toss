# Hono sample

This sample uses Hono from Toss through JavaScript imports and callback
adapters. `app.toss` creates the app and routes but does not start a server or
run checks when imported.

## Files

- `app.toss` creates and exports the Hono app.
- `main.toss` starts a local HTTP server.
- `verify.toss` checks the app in memory with `app.request`.
- `imports.toss` and `callbacks.toss` are short interop walkthroughs.

## Run the server

From the repository root, compile and run:

```sh
mise exec -- deno task compile examples/hono/main.toss -o out/hono/main.js
mise exec -- deno run --no-config --allow-net=127.0.0.1 out/hono/main.js 8000
```

The server listens on `127.0.0.1:8000`. `GET /hello/:name` returns a greeting
as plain text. `POST /echo` accepts JSON with a String `name` and returns a
Toss echo as JSON. Invalid JSON and invalid names return a 400 response.
Responses include `X-Toss: after` and an `X-Toss-Trace` header.

## Verify without a server

From the repository root, compile and run the in-memory verifier:

```sh
mise exec -- deno task compile examples/hono/verify.toss -o out/hono/verify.js
mise exec -- deno run --no-config out/hono/verify.js
```

The verifier exercises the greeting, concurrent echo requests, invalid input,
middleware headers and trace order, and a missing route. It opens no listening
socket.

## Hono package

The app pins `npm:hono@4.12.12`. Keep this package requirement pinned so the
sample uses the same Hono API. Toss compilation bundles local Toss modules into
the generated JavaScript file. Deno resolves Hono as a JavaScript package at
runtime; no separate Node installation is needed.
