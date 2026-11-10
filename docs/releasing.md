# Releasing Toss

0.0.1 is a development milestone. The package is `@tosslang/toss`; verify that
the authenticated JSR account can publish to `@tosslang` before starting.
Keep the package version in `deno.json` as the only CLI version source.

## Prepare the exact source

1. Use Deno 2.9.7 from `mise.toml` on macOS. Record `deno --version`,
   `sw_vers`, `uname -m`, and `git rev-parse HEAD` in release evidence.
2. Review `git status --short` and `git diff`; commit the intended release
   changes, leaving a clean source tree. Do not include local evidence files.
3. Check `name`, `version`, `exports`, and `publish.include` in `deno.json`.
   Check the version does not already exist on JSR. Confirm ownership and
   choose an unused `v<version>` tag referring to this exact tested commit.
4. Run `deno task check`, `deno task test`, and `deno publish --dry-run`.
   Capture each invocation, complete output and exit status. Do not bypass
   slow types. During development `--allow-dirty` can preview contents, but
   the final release check must use the clean commit without that flag.
5. Inspect every dry-run file. Confirm license, preludes, macro libraries,
   JSON version metadata and all relative imports are present. Copy the
   listed contents into a temporary directory and run all API and CLI
   entrypoints there. Check help/version, a local module plus macro fixture,
   generated output, REPL, invalid import and incompatible runtime failures.
6. Execute documented examples. Record supported hosts precisely; do not
   turn historical browser observations into a current three-browser claim.
   Browser compiler/REPL examples are separate from generated-JS support.
7. Review release notes and migration guidance. The initial notes are under
   `Unreleased` until publication is verified. Record artifact paths and
   SHA-256 hashes of the checked configuration and distribution files.

## Publish and verify

Run `deno publish` only for the reviewed clean commit and authorized scope.
Complete its authentication flow; if access is unavailable, report publication
blocked. A successful local dry-run does not prove upload or ownership.

In a new directory with a new Deno cache, fetch the exact version and run:

```sh
deno run jsr:@tosslang/toss@0.0.1/cli --version
deno run jsr:@tosslang/toss@0.0.1/runtime-cli --help
deno run jsr:@tosslang/toss@0.0.1/repl-cli --help
```

Repeat the README's pinned installations and hello flow, then import `.`,
`/source` and `/repl`, compile a module plus macro-library fixture, execute
the result, and submit REPL input. Verify an unexported subpath, nonexistent
version, invalid Toss import and mismatched runtime fail. Capture all commands,
exit codes and output. Record the JSR version URL and its source identity.

Only after verification, create `v0.0.1` at the exact published commit and
record its commit hash. Seal the changelog with the actual publication date
and link the immutable tag. A documentation follow-up must not move the tag.

## Recovery

Never overwrite a published version or retag different source as the release.
If publication fails, inspect JSR before retrying: an interrupted client may
have completed the upload. If a published package fails consumer verification,
record the reproduction and affected version in a GitHub issue, fix and test
the defect, document migration or workaround instructions, then publish a new
version. Use 0.0.2 only when that correction is needed. Repeat clean-directory
verification for the correction and retain the original release evidence.
