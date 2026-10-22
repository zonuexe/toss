# ADR-37: Local modules in one JavaScript bundle

The user accepted Q1-Q11 of the module discussion. Compile an entry and its
static dependencies into one standalone JavaScript file. Share runtime code,
but keep each file's root Environment and `$Object`/`$Symbol` root Objects
separate. Named symbol identity is shared across the execution. Exported Blocks
retain their defining file's Environment and the existing method/self rules.

## Import and export

`%import('./math.toss')` is a primary expression returning one public value of
any Toss type. Bind a local alias through ordinary `#Math bind:`. It can appear
inside a Block or conditional branch. The path must be a literal String with
an explicit `.toss` extension, beginning with `./` or `../`. Resolve it from the
importing file, not the process working directory. URL, absolute, package and
JavaScript imports are outside this slice. Standard-library naming and
resolution are explicitly deferred; local paths do not decide that interface.

`%export(expression).` is a standalone top-level statement. An imported file
must contain exactly one; the entry may omit it, but cannot contain more than
one. Export inside a Block, argument, pipeline or other expression is a compile
error. It records its evaluated value without ending file execution. Complete
all top-level statements successfully before an import returns. Export does
not make a live alias to a binding and does not copy values: later rebinding
does not replace the recorded value, while mutation of an exported Object is
visible through the same reference. There is no implicit last-expression export.

Both macro openers require adjacency to `(`. Import accepts one String literal;
export accepts one full Toss expression. Empty/multiple arguments, trailing
commas and missing delimiters are errors. Named symbols `#import` and `#export`
remain ordinary values. No `as:` syntax or generic statement macros are added,
and the arithmetic operand grammar is unchanged.

## Compilation and initialization

Collect, resolve and validate all dependencies during compilation, including
imports inside unused Blocks or branches. Missing files, invalid paths,
invalid export placement/counts and static cycles are compilation errors.
Do not execute Toss code while compiling. Resolve canonical file identity so
path normalization and symlink aliases refer to one module.

Initialize a module only when an import expression first executes. Execute its
file once, cache its exact public value and return that value on later imports.
Diamond dependencies share the same initialized module. Cache initialization
failures too: later imports rethrow the same error without repeating effects.
There are no partial exports or retry semantics. Existing error handling rules
stop the program when such an error is not caught.

The generated bundle needs no source files, filesystem access or network at
runtime. File-private bindings and root Object changes do not leak to sibling
modules. Module roots do not inherit the importing method's parent-call context.
Missing dependencies identify the import site; syntax and runtime errors inside
dependencies retain their original file and position. A failed compilation
does not replace an existing output file.

```text
// math.toss
#offset bind: 10.
%export($Object clone |> %extend(
  'addOffset:': { n -> $n add: $offset }
)).

// main.toss
#Math bind: %import('./math.toss').
($Math addOffset: 3) print.
```
