# Release contract

Toss 0.0.1 is a development milestone. It is not a stable language release;
0.1.0 remains a medium-term goal. Before 1.0, breaking changes must be recorded
in the changelog with migration instructions, including changes to syntax,
observable runtime behavior, public compiler options, and CLI usage.

## Package boundary

The owner selected `@tosslang/toss` as the JSR package name. Publishing access
must be verified separately before publication.
The package version in `deno.json` is the single source for CLI version output.
The supported entrypoints are:

| Subpath | Source | Public contract |
| --- | --- | --- |
| `.` | `src/compiler.ts` | `compile`, `compileSources`, `compileFile`, `generateRuntimeModule`, `CompileFormat`, `CompileOptions` |
| `./source` | `src/source_compiler.ts` | `compile`, `compileSources`, `CompileFormat`, `CompileOptions`; virtual sources do not read files |
| `./repl` | `src/repl_core.ts` | `createBrowserReplSession`, `AsyncReplSession`, `ReplResult`, `BrowserReplSessionOptions` |
| `./cli` | `src/cli.ts` | compiler command |
| `./repl-cli` | `src/repl_cli.ts` | Deno terminal REPL command |
| `./runtime-cli` | `src/runtime_cli.ts` | external runtime generation command |

Other source modules are internal. CLI subpaths execute only when run as the
main module. The compiler reads Toss files and macro libraries and writes the
requested JavaScript output; the runtime command only writes its output.
The Deno REPL reads local Toss modules and macro libraries and evaluates generated
code in memory; it does not require write permission for temporary modules.
User JavaScript runs with the Deno permissions explicitly granted by the caller.

## Compatibility boundary

The initial guaranteed compiler host is Deno 2.9.7, pinned in `mise.toml`, on
macOS. Other Deno versions and operating systems are not initially guaranteed.
Generated JavaScript targets Deno and browser ESM; Node.js support is not
promised. Record the exact environments actually tested in release evidence.
The current stable Chromium, Firefox and actual Safari matrix is a goal for a
later release, not a verified 0.0.1 guarantee.

The browser-hosted compiler and REPL are examples. The `./repl` API exposes
the virtual-source REPL core, but does not make the example application a
supported product. Its evaluation requires `Function`/`eval`; generated
ahead-of-time JavaScript has a separate browser execution contract.

Generate applications and external runtime assets with the same compiler
version. The runtime fingerprint identifies generated runtime content, not the
package release version, and is not an integrity check. Runtime compatibility
checks remain required even when package versions match. See
[ADR-50](adr/0050-external-runtime-module.md).

Published versions are immutable. Use 0.0.2 only for a necessary correction
after 0.0.1 has been published; do not replace 0.0.1 or schedule a speculative
version bump.
