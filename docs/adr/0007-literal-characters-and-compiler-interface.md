# ADR-7: Literal characters and the first compiler interface

Single-quoted strings allow literal tabs and line breaks, preserve them without indentation stripping, and decode only the escapes defined in [ADR-6](0006-single-quoted-strings.md); double-quoted strings are deferred.
Implement the compiler in TypeScript and use Deno for development and tests.
The first compiler interface reads a source file and writes one JavaScript file containing the required prelude and runtime code, with generated output excluded from Git.

## Intended commands

```sh
mise exec -- deno task compile examples/hello.toss -o out/hello.js
mise exec -- deno run out/hello.js
```

These commands define the required interface; the compiler task is not implemented yet.
