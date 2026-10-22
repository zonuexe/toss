# Hono adapter example

This example separates reusable host integration from app policy. The adapter
and test helpers live in `lib/hono/`; `app.toss` chooses routes, validation,
responses and error policy. `main.toss` only connects that facade to Deno.
Importing either the adapter or app does not start a listener.

## Run

From the repository root, compile and start the local server. The final
argument selects the port; it defaults to `8000`.

```sh
mise exec -- deno task compile examples/hono/main.toss -o out/hono/main.js
mise exec -- deno run --no-config --allow-net=127.0.0.1 out/hono/main.js 8000
```

The app serves `GET /hello/:name` and `POST /echo`. Its middleware stores the
trace as a request-scoped String in Hono context. Invalid JSON and invalid
`name` fields follow app-owned error policies.

## Verify without a server

The verifier exercises six scenarios in memory, including concurrent Alice and
Bob requests, malformed JSON, invalid field types and a missing route. Its expected
values and scenario order remain in Toss.

```sh
mise exec -- deno task compile examples/hono/verify.toss -o out/hono/verify.js
mise exec -- deno run --no-config out/hono/verify.js
```

The first run may resolve the pinned Hono package through Deno. Use
`--cached-only` after that when you want to ensure the verifier uses only the
existing cache. An independent app with different routes, context data, async
handling and custom error behavior is covered by:

```sh
mise exec -- deno task compile examples/hono/independent-verify.toss -o out/hono/independent-verify.js
mise exec -- deno run --no-config out/hono/independent-verify.js
```

`imports.toss` and `callbacks.toss` remain explicit-JavaScript walkthroughs of
the lower-level JS module and callback interfaces.

## Layers

- `lib/hono/adapter.toss` provides the Toss App and Context facades.
- `lib/hono/testing.toss` adapts generic host assertions, response access,
  RequestInit construction, Promise aggregation and reporting.
- `lib/hono/deno.toss` owns Deno-specific listening behavior.
- `lib/hono/macros.toss` provides caller-scoped shared syntax helpers.
- `app.toss` and `independent.toss` contain user route and error policy.
- `verify.toss` and `independent-verify.toss` orchestrate their own scenarios.

Hono stays pinned to `npm:hono@4.12.12`. See
[`lib/hono/README.md`](../../lib/hono/README.md) for the adapter API and
[`lib/hono/adapter.toss`](../../lib/hono/adapter.toss) for its implementation.
