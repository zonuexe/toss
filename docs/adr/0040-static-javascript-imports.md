# ADR-40: Static JavaScript module imports

Hono needs a JavaScript module entry point as well as the expression boundary
in ADR-38. Use `%jsImport('specifier')` to return an opaque JS reference to an
ESM namespace. Keep `%import('./file.toss')` for Toss modules under ADR-37.
Static ESM keeps package loading in the host and does not require Promise
support in Toss. The user authorized starting this interop slice.

The opener must be adjacent to `(`. Accept exactly one nonempty literal
String. Accept bare package names, host schemes such as `npm:`, `jsr:` and
`node:`, and absolute URLs. Reject a leading dot, slash or backslash,
Windows drive paths, any backslash, and ASCII whitespace or control characters.
Relative JavaScript paths need a later source-to-output resolution decision.
Bare names and schemes are interpreted by the host that runs the generated
file, including its import map and package configuration.

Generate namespace imports at the top of the JavaScript artifact. Collect
imports after macro expansion, including imports in Blocks, unused branches
and bundled Toss dependencies. Deduplicate exact specifier strings across
the artifact in first-seen traversal order. The host may also canonicalize
different specifiers. Do not load, fetch or execute a JS module while compiling.

ESM dependencies initialize before the Toss program starts, even when an
import expression is inside an uncalled Block or an uninitialized Toss module.
This is deliberately different from lazy Toss module initialization. The host
owns JS resolution errors, module initialization errors, caching and permissions.
These errors occur during ESM loading and are not wrapped as Toss runtime errors.

Evaluating the expression wraps the namespace with ADR-38's identity-preserving
JS reference conversion. Access named or default exports inside `%js`, using
`module.name` or `module.default`. JS references keep their existing messages.
Programs without `%jsImport` keep the current generated script behavior.

Local macros may generate runtime `%jsImport` expressions or quote them as
data. They cannot execute JS imports during expansion or redefine `jsImport`.
Toss callback adapters, Promise waiting, relative JS imports and JavaScript
exports from the generated artifact remain later slices.

```text
#path bind: %jsImport('node:path').
%js(module = $path; module.basename('/tmp/hello.txt')) print.
```
