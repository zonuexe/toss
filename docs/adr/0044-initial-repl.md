# ADR-44: A stateful REPL using the generated runtime

The user chose a minimal REPL before adding imports. Provide a reusable session
and a Deno terminal entry point. Reuse the compiler and runtime so message
dispatch, lexical bindings and display follow the existing language. Do not
simulate persistence by replaying earlier input or by running runtime programs
through the compile-time macro evaluator.

## Input and results

A cell is complete when its ordinary Toss statements end in a top-level period
and its groups and strings are closed. Continue incomplete input across lines.
Blank input and comments produce no value. Display the last runtime expression
using `inspect`, prefixed with `=> `. Macro-only cells have no runtime result.
`print` retains its output and receiver-return behavior, so automatic display
can follow explicit output. Do not insert periods or implicitly await results.

One session keeps its Environment, Prelude roots, object identities, closures
and local macro definitions. Macro lookup retains source order and provenance
across cells, with a fresh expansion budget per submission. Keep a stable
`<repl>` source identity and advancing source positions. Sessions are separate.

Compile a completed cell before executing any of it. Invalid syntax must not
commit definitions or effects. Successful compilation commits macro definitions;
if runtime evaluation then fails, earlier binds and mutations remain. There is
no rollback. Display-conversion errors also report a diagnostic without
replaying the cell. Later input can continue after an ordinary user error.

## Terminal behavior

Use `toss> ` and `...> ` prompts only for an interactive terminal. Piped input
has no banner or prompts; results go to stdout and diagnostics to stderr.
Continue processing complete input after errors, but return a nonzero batch
exit status if any cell failed. Normal interactive exit remains successful.
Incomplete EOF is an error and never executes partial input.

Use Deno's built-in `node:readline` for line input, terminal editing, in-memory
line history and prompt rendering. Enable terminal mode only when both stdin
and stdout are terminals. Toss retains ownership of multiline accumulation,
syntax completeness and evaluation. Readline handles newline boundaries,
including CRLF split across chunks, with `crlfDelay: Infinity`. Close the
interface and release its input resources on exit. Ctrl-C exits with status
130 without a stack trace.

Consume `line` events synchronously and use `node:process` streams for prompts,
results and diagnostics. An async-iterator probe on the pinned Deno delayed
TTY evaluation until the interface closed, while line events ran immediately.
Verify actual terminal input as well as piped input when changing this adapter.

`:help` describes the interface, `:quit` exits, `:reset` creates a new session,
and `:cancel` discards pending input without clearing earlier bindings. Help
does not discard pending input. Commands are REPL operations, not Toss syntax.

## Deferred

Reject `%import`, `%jsImport`, `%macroImport` and `%export` before cell effects,
including unused nested forms. Import resolution, module caching and shared
macro library loading need a later session-aware design. Ordinary `%js` keeps
its existing explicit host boundary and host permissions. Root `%await` stays
invalid; async values use the existing JS reference display. Disk history,
completion, implicit awaiting and background-task management are deferred.
