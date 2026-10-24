# ADR-48: JavaScript module output

Add an opt-in `esm` output format so JavaScript applications can import a
Toss module's public value without callback registration. Keep the existing
`program` output as the default. Reuse the one-value export model instead of
adding named-export syntax in this slice.

## Compilation and initialization

The CLI accepts `--format esm` or `--format program`. Compiler APIs accept
an optional `format` option: `compile(source, file, options)` and
`compileFile(input, output, options)`. Existing calls keep their behavior.

An `esm` entry requires exactly one standalone top-level `%export(value).`.
The entry completes all its statements before the generated module exposes
the value as its JavaScript default export. The export records a value,
not a live alias to a Toss binding. Rebinding does not replace that value;
later mutation of the recorded Object or Array remains visible.

Imported Toss modules retain ADR-37's private environments, lazy initialization
and cached values or failures. The host initializes the generated ES module
and its entry under ordinary ESM loading rules. Do not execute Toss code
during compilation. Missing, duplicate or nested exports are compilation
errors and do not replace an existing output file.

## JavaScript value boundary

Convert the entry's public value once with ADR-38's existing Toss-to-JS rules.
Nil becomes null, JS references unwrap, and Objects and Arrays retain their
shared references. Conversion is shallow; nested Blocks are not automatically
adapted. A directly exported ordinary Block fails at runtime at the export
site. Use `asJSCallback` explicitly to export a native function.

Async results cross as native Promises without implicit waiting. Callback
identity, argument conversion, lexical captures and error propagation remain
as defined in ADR-41 and ADR-42. A JS object containing adapted functions can
be constructed explicitly with `%js` and exported as one value.

This format does not add named JS exports, recursively convert Toss slots,
share runtime identity between separately compiled bundles, remove `%js`
string evaluation, or implement a browser-hosted compiler. These are separate
changes. Runtime and prelude code remain embedded in each generated module.

ADR-49 later removes implicit string evaluation from ahead-of-time `%js`
execution while preserving this export contract.
