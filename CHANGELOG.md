# Changelog

All notable changes are recorded here. Before 1.0, breaking changes require migration instructions. Published versions are immutable.

## [Unreleased]

### Added

- Prepare 0.0.1 as the first development milestone for `@tosslang/toss`, with explicit compiler, virtual-source compiler, REPL core and CLI entrypoints.
- Provide `--help` and `--version` for the compiler, runtime generator and terminal REPL.
- Document Deno 2.9.7 on macOS as the initial compiler host, with generated JavaScript targeting Deno and browser ESM.

### Fixed

- Reject unknown terminal REPL command-line arguments instead of silently starting a session.
- Correct language-tour binding references and distinguish deferred effects, cleanup and collection proposals from implemented behavior.

### Migration to 0.0.1

This is the first packaged release, so there is no previous published version to migrate. Checkout users can use the pinned JSR commands after publication; keep existing `deno task` workflows for repository examples. Use only documented exports, and regenerate external runtimes and applications together. Scripts that passed ignored arguments to the REPL must remove them or use `--help`/`--version` alone.

The 0.0.1 publication date and immutable tag are recorded only after publication is verified. 0.0.2 is reserved for a necessary correction, not a scheduled release.
