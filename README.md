# Toss ⚾️

> **Everything is a dictionary. Everything is a message. Zero reserved keywords.**

**Toss** (Working Title) is a minimalist, purely object-oriented programming language that distills the most beautiful concepts in computer science history into just **five syntax rules**.

Inspired by the dynamic message-passing of Smalltalk, the metaprogramming power of Lisp, and the prototype chain of JavaScript, Toss targets modern JavaScript with a small runtime. The current compiler uses Deno.

## Try the first compiler

### Symbols, macros, and annotations

| Form | Role | Status |
| --- | --- | --- |
| `#name` | Named symbol: a runtime value | Implemented |
| `$name` | Fetch a binding | Implemented |
| `%name(...)` | Explicit named compiler macro | Built-ins and local user-defined expression macros are implemented |
| `%name ... .` | Statement macro | Planned |
| `@name` | Call-related Annotation | Planned; declaration and application details are undecided |
| `$()` | Dedicated arithmetic macro | Implemented; `%` inside arithmetic remains remainder |

An Annotation's declaration will select runtime invocation or compile-time
expansion. Expansion can omit the call to the Annotation itself, but may
still generate runtime work. Attributes represent attached data; their
representation and syntax are undecided. `@name` is reserved for Annotations.
Optional colon type annotations are a separate future facility. See
[ADR-32](docs/adr/0032-macro-and-annotation-sigils.md).

### Implemented subset

The current implementation supports single-quoted strings, named symbols,
bindings and references, unary and keyword messages, expression grouping,
pipelines, blocks and closures with parameters, Nil and empty blocks,
multiple statements, and `//` line comments. The built-in arithmetic macro is
available as `$(1 + 2 * 3)` and lowers operators to ordinary messages. Its
operands are limited to numbers, `$name` fetches, arithmetic groups, and nested
arithmetic macros; unary and keyword messages inside operands are not accepted.
It also supports `<`, `<=`, `>`, `>=`, `==`, and `!=`, with one comparison per
unparenthesized arithmetic group. The `%extend(...)` object macro is described
below. Further macro forms and effects remain design goals. See
[ADR-26](docs/adr/0026-arithmetic-macro.md) and
[ADR-27](docs/adr/0027-comparison-macro.md) for the implemented limits.

```sh
mise exec -- deno task compile examples/arithmetic.toss -o out/arithmetic.js
mise exec -- deno run out/arithmetic.js
mise exec -- deno task compile examples/comparisons.toss -o out/comparisons.js
mise exec -- deno run out/comparisons.js
```

Array literals use commas, for example `[1, 'two', [3]]`. Arrays support
`length`, `at:`, `at:put:`, and `map:`; indexes are checked. `map:` calls a
one-argument Block from left to right and returns a fresh array. See
[ADR-21](docs/adr/0021-array-literals-and-indexing.md) and
[ADR-22](docs/adr/0022-array-map.md). Arrays also support `reduce:with:` with an
initial accumulator and a two-argument Block. See
[ADR-23](docs/adr/0023-array-reduce.md). `inspect` and `toString` return
bracketed element representations, and `print` and `dump` write those forms
with a newline while returning the array. Cycles display as `[...]`. See
[ADR-25](docs/adr/0025-array-display.md). `filter:` calls a one-argument Block
that must return a Boolean, then returns matching original values in a fresh array. See
[ADR-24](docs/adr/0024-array-filter.md). Grouped executable examples are in
`examples/array-filter.toss`:

```text
#numbers bind: [1, 2, 3, 4, 5, 6].
#even bind: ($numbers filter: { number ->
  ($number remainder: 2) equals: 0
}).
#large bind: ($numbers filter: { number ->
  $number greaterThan: 3
}).
($even length) print.
($even at: 0) print.
($even at: 1) print.
($even at: 2) print.
($large length) print.
($large at: 0) print.
($large at: 1) print.
($large at: 2) print.
```

```sh
mise exec -- deno task compile examples/array-map.toss -o out/array-map.js
mise exec -- deno run out/array-map.js
mise exec -- deno task compile examples/array-reduce.toss -o out/array-reduce.js
mise exec -- deno run out/array-reduce.js
mise exec -- deno task compile examples/array-filter.toss -o out/array-filter.js
mise exec -- deno run out/array-filter.js
mise exec -- deno task compile examples/array-display.toss -o out/array-display.js
mise exec -- deno run out/array-display.js
```

Future collection candidates, including `filterMap` and `flatMap`, are recorded
in [Future work](docs/future-work.md).

Use mise to install the pinned Deno version, then compile and run the example:

```sh
mise install
mise exec -- deno task compile examples/hello.toss -o out/hello.js
mise exec -- deno run out/hello.js
```

The example prints `Hello, Toss!`. The generated JavaScript includes its prelude
and runtime code and needs no imports. Generated files under `out/` are ignored
by Git.

The prelude provides `toString`, `inspect`, `print`, and `dump` for strings and
named symbols. For strings, `toString` returns the original string and `inspect`
returns its JSON string representation, including quotes and escaped control
characters. For symbols, `toString` returns the name and `inspect` adds `#`.
`print` sends `toString` and writes the result with a newline; `dump` does the
same through `inspect`. Both output messages return the original receiver.
`'World' print print.` therefore prints `World` twice, while `'World' dump.`
prints `"World"`. Conversion results must be strings or execution fails.

Try the display example:

```sh
mise exec -- deno task compile examples/display.toss -o out/display.js
mise exec -- deno run out/display.js
```

Single-quoted strings decode only `\\` and `\'`; literal tabs and line breaks
are preserved. Unknown messages fail at runtime. Syntax and message errors
report the original Toss file, line, and column and exit with a nonzero status.

### Bindings and symbols

`#name` is an interned symbol. Sending it `bind:` stores a value in the current
file's environment and returns that value. `$name` fetches the binding; an
unbound name is a runtime error. Rebinding replaces the previous value, and
each generated file has its own environment.

```text
#greeting bind: 'Hello, Toss!'.
$greeting print.
#key bind: #greeting.
$key bind: 'Goodbye'.
$greeting print.
```

Unary messages bind more tightly than keyword messages: in
`#greeting bind: 'Hello' print.`, the string is printed before it is bound.
Multiple keyword parts form one message, such as `at:put:`, with arguments
evaluated from left to right. Only `bind:` is provided in this version; other
keyword messages fail at runtime.

```sh
mise exec -- deno task compile examples/bindings.toss -o out/bindings.js
mise exec -- deno run out/bindings.js
```

### Dictionary objects

Every generated file starts with a fresh `$Object`, a native object with no
prototype. Clone it to create dictionaries with prototype inheritance:

```text
#parent bind: $Object clone.
$parent at: 'greeting' put: 'Hello'.
#child bind: $parent clone.
($child at: 'greeting') print.
$child at: 'greeting' put: 'Hi'.
```

`clone` copies no slots. A child sees parent changes until it writes an own
override. `at:` reads through the prototype chain, and `at:put:` returns the
stored value. Keys are strings or symbols, which remain distinct; blocks read
from slots are returned as data. Missing keys and invalid key types are runtime
errors. `__proto__`, `constructor`, and `toString` are safe ordinary keys.
Unsupported object messages report `Object`. A matching string-keyed slot
dispatches as a message before object prelude methods; blocks stored in slots
run with the actual receiver bound as `$self`, while non-block slots answer
unary messages as data. Inherited methods receive the child as `$self` too.
Returned blocks keep their lexical `$self`, and ordinary `value` calls do not
rebind it. Objects can customize `toString` and `inspect` for `print` and
`dump`; both conversions must return strings.

Use the built-in `%extend(...)` macro to set several slots:

```text
#Dog bind: ($Object clone |> %extend(
  name: 'Pochi',
  bark: { $self name print }
)).
$Dog bark.
```

It updates and returns the original Object. Each label becomes a string key;
values are evaluated and assigned from left to right through `at:put:`.
Values use the caller's scope, and Blocks become Methods under the existing
`$self` rules. Empty extensions are allowed. Use `clone` explicitly for a new
child. Trailing commas and standalone macro calls are unsupported;
`#extend` is always an ordinary symbol; the old `#extend(...)` macro spelling
is no longer accepted. See
[ADR-28](docs/adr/0028-extend-macro.md) for the full contract.

Single-quoted string keys also support keyword Methods:

```text
#counter bind: ($Object clone |> %extend(
  base: 10,
  'add:': { n -> $self base add: $n }
)).
($counter add: 3) print.
```

Quoted labels retain the whole string, including selector colons. Bare `name:`
and quoted `'name':` address the same slot; `'name:':` addresses a different
slot. Arbitrary string keys can be read through `at:`. See
[ADR-29](docs/adr/0029-extend-string-keys.md).

Computed keys use `(expression): value`. Their default setter accepts strings
and symbols, with their usual separate identities:

```text
#field bind: 'score'.
#record bind: ($Object clone |> %extend(($field): 42, (#tag): 'info')).
($record at: $field) print.
($record at: #tag) print.
```

Each key is evaluated before its value in the caller's scope. Updates still
use ordinary `at:put:`. See [ADR-30](docs/adr/0030-extend-dynamic-keys.md).

Use `perform:` to select a message dynamically and call it without arguments:

```text
#action bind: #greet.
#obj bind: ($Object clone |> %extend(
  name: 'Toss',
  ($action): { $self name }
)).
($obj perform: $action) print.
($obj perform: 'name') print.
```

Inherited Methods receive the actual Object as `$self`. Non-block slots return
their value. String and Symbol keys remain distinct: `#greet` does not select
`'greet'`. Any String can select a stored slot. String selectors also support
Object prelude messages such as `'clone'`; selecting a prelude that requires
arguments is a runtime error. `perform:` is provided only for Objects. See
[ADR-31](docs/adr/0031-perform-without-arguments.md).

Use `perform:withArguments:` to pass an Array of arguments:

```text
#obj bind: ($Object clone |> %extend(
  (#sum): { left, right -> $left add: $right }
)).
($obj perform: #sum withArguments: [2, 3]) print.
```

It keeps the same key lookup and `$self` rules. Block parameter counts are
checked independently of the slot key's spelling. String prelude selectors
check their required argument counts too. Empty Arrays allow zero-argument
calls; non-block slots reject nonempty argument Arrays. The argument list is
shallow-snapshotted, and the result is returned unchanged. This message is
also provided only for Objects. See
[ADR-33](docs/adr/0033-perform-with-arguments.md).

`$Symbol generateUnique` creates a fresh Symbol key on each call. Unlike
interned `#name` Symbols, generated keys cannot be recreated from a name.
They work with computed `%extend` labels, slot access and dynamic messages.
The factory is an ordinary Object with an overridable zero-argument method.
Unique keys display as `<unique>` and inspect as `#<unique>`; these labels do
not encode identity. Anyone holding a key can use it, so key sharing affects
access. See [ADR-34](docs/adr/0034-unique-symbols.md).

Symbols receive `equals:` with another Symbol and return a Boolean based on
identity. Aliases and repeated interned names compare equal; separate Unique
symbols compare unequal even though their display labels match. Other
argument types are runtime errors. Arithmetic `==` and `!=` also work on
fetched Symbols through ordinary message dispatch. See
[ADR-35](docs/adr/0035-symbol-equality.md).

Use `%super()` or `%super(expr, expr)` inside a method to call its parent
implementation under the same exact key. Arguments are always explicit;
`%super()` never forwards the current method's arguments. Lookup starts above
the selected slot owner, preserving the original receiver as `$self`, including
when the override was inherited by another child. Parent slots are resolved
live after argument evaluation. Escaped Blocks retain their parent-call context
for ordinary `value` calls; installing a Block as a method supplies fresh context.
Missing context or parent implementations are runtime errors. String keys can
reach Object prelude fallbacks, while Symbol keys cannot. See
[ADR-36](docs/adr/0036-parent-calls.md) and the runnable example below.

```sh
mise exec -- deno task compile examples/extend.toss -o out/extend.js
mise exec -- deno run out/extend.js
mise exec -- deno task compile examples/extend-string-keys.toss -o out/extend-string-keys.js
mise exec -- deno run out/extend-string-keys.js
mise exec -- deno task compile examples/extend-dynamic-keys.toss -o out/extend-dynamic-keys.js
mise exec -- deno run out/extend-dynamic-keys.js
mise exec -- deno task compile examples/perform.toss -o out/perform.js
mise exec -- deno run out/perform.js
mise exec -- deno task compile examples/perform-arguments.toss -o out/perform-arguments.js
mise exec -- deno run out/perform-arguments.js
mise exec -- deno task compile examples/unique-symbols.toss -o out/unique-symbols.js
mise exec -- deno run out/unique-symbols.js
mise exec -- deno task compile examples/symbol-equality.toss -o out/symbol-equality.js
mise exec -- deno run out/symbol-equality.js
mise exec -- deno task compile examples/super.toss -o out/super.js
mise exec -- deno run out/super.js
```

```sh
mise exec -- deno task compile examples/objects.toss -o out/objects.js
mise exec -- deno run out/objects.js
```

Compile and run the methods example:

```sh
mise exec -- deno task compile examples/methods.toss -o out/methods.js
mise exec -- deno run out/methods.js
```

See [ADR-15](docs/adr/0015-dictionary-objects.md) and
[ADR-16](docs/adr/0016-method-dispatch-and-self.md) for object dispatch and
method receiver behavior.

### Grouping expressions

Parentheses group one expression, including a keyword message:

```text
(#greeting bind: 'Hello') print.
#copy bind: (#greeting bind: 'Goodbye').
$copy print.
```

Groups can be nested and share the current environment. A group has no final
period; its containing statement still needs one. Empty groups and multiple
statements inside a group are syntax errors.

```sh
mise exec -- deno task compile examples/grouping.toss -o out/grouping.js
mise exec -- deno run out/grouping.js
```

### Pipelines

`|>` passes its left result as the omitted final argument of the keyword message
on its right. Chained pipelines run from left to right:

```text
'Hello'
    |> #greeting bind:
    |> #copy bind:.
$copy print.
```

Unary and keyword messages bind more tightly than pipelines. The left expression
is evaluated once, before the right receiver and its explicit arguments.
Parentheses can group a pipeline, as in `('Hello' |> #greeting bind:) print.`.
The right side must omit its final argument; unary-only sends, fully supplied
arguments, and missing earlier arguments are syntax errors.

```sh
mise exec -- deno task compile examples/pipeline.toss -o out/pipeline.js
mise exec -- deno run out/pipeline.js
```

### Numbers and booleans

Numbers support finite decimal literals such as `12`, `-2`, and `3.5`.
They use JavaScript floating-point arithmetic. Send `add:`, `subtract:`,
`multiplyBy:`, `divideBy:`, `remainder:`, or `negated` to calculate a value.
Numeric arguments are required; zero division and nonfinite results are errors.
Comparisons (`equals:`, `lessThan:`, `greaterThan:`, `lessThanOrEqual:`,
`greaterThanOrEqual:`) return booleans. `$True` and `$False` are ordinary
bindings, and booleans receive `not`. Both types support the usual display
messages. See [ADR-18](docs/adr/0018-numbers-and-booleans.md) for exact rules.

Numbers also receive `times:`. A nonnegative safe integer count calls its block
with no arguments that many times and returns the last result; zero returns
Nil. For example:

```text
(3 times: { 'again' print }) print.
```

Compile and run the repetition example:

```sh
mise exec -- deno task compile examples/repetition.toss -o out/repetition.js
mise exec -- deno run out/repetition.js
```

See [ADR-20](docs/adr/0020-counted-repetition.md) for validation and invocation
rules.

```text
(2 add: 3) print.
(2 lessThan: 3) not dump.
```

```sh
mise exec -- deno task compile examples/numbers.toss -o out/numbers.js
mise exec -- deno run out/numbers.js
```

Booleans also receive `ifTrue:`, `ifFalse:`, and `ifTrue:ifFalse:`. They
accept blocks, run only the selected block, and return its result. A one-sided
conditional returns Nil when its branch is skipped. The compound selector is
one message whose keyword parts surround its block arguments:

```text
($True ifTrue: { 'yes' } ifFalse: { 'no' }) print.
($False ifFalse: { 'also yes' }) print.
```

See [ADR-19](docs/adr/0019-boolean-conditionals.md) for argument checks and
evaluation rules. Run the example with:

```sh
mise exec -- deno task compile examples/conditionals.toss -o out/conditionals.js
mise exec -- deno run out/conditionals.js
```

### Nil and empty blocks

`$Nil` is the absent-result value. It is an ordinary binding, so it can be
shadowed. Nil converts to `nil` for `toString` and `inspect`; `print` and `dump`
write `nil` and return Nil. Empty blocks, including blocks with parameters,
return Nil when called with exactly the declared number of arguments:

```text
{} value print.
({ unused -> } value: 'argument') dump.
```

Nil can be stored in an object slot. A present Nil slot reads as Nil, while a
missing slot remains an error. Nil cannot be an object key.

### Blocks and closures

Blocks defer execution until they receive `value` or `value:`:

```text
#hello bind: { 'Hello' print }.
$hello value.
#echo bind: { name -> $name print }.
$echo value: 'Toss'.
```

A block returns its last expression. Periods separate expressions inside the
body; the final period before `}` is optional. Blocks capture their defining
environment by reference. Each call has fresh local bindings and parameter
bindings; fetch searches outward, while `bind:` only updates the current scope.
Returned blocks retain access to the environment in which they were created.

```text
#makeReader bind: { name -> { $name } }.
#read bind: ($makeReader value: 'Captured').
$read value print.
```

Use comma-separated names for multiple parameters and repeat `value:` once for
each argument:

```text
#show bind: { first, second -> $first print. $second print }.
$show value: 'Hello' value: 'Toss'.
'Toss' |> $show value: 'Hello' value:.
```

Arguments are evaluated from left to right. Wrong argument counts are runtime
errors; duplicate parameter names and trailing commas are syntax errors.
`value` remains the zero-argument call.

```sh
mise exec -- deno task compile examples/blocks.toss -o out/blocks.js
mise exec -- deno run out/blocks.js
```

```sh
mise exec -- deno task compile examples/multi-argument-blocks.toss -o out/multi-argument-blocks.js
mise exec -- deno run out/multi-argument-blocks.js
```

Run the tests and code checks:

```sh
mise exec -- deno task test
mise exec -- deno task check
```

## Local modules

An import returns one value; use an Object to group public members. Each file
keeps its bindings private, including bindings used by exported Blocks:

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

Paths are literal relative `.toss` paths resolved from the importing file.
Each dependency requires one standalone top-level `%export(value).`; the entry
may omit it. Export records a value and execution continues to the end of the
file. Import expressions can be delayed inside Blocks; initialization runs
once at first use, and both values and failures are cached. All dependencies
are validated at compile time, including unused imports, and cycles are errors.
Runtime code is shared, while root Environments and root Objects are separate.
Toss standard-library paths remain undecided. Use `%jsImport` below for host
JavaScript packages and URLs; relative JavaScript files remain future work.
See [ADR-37](docs/adr/0037-local-modules.md).

```sh
mise exec -- deno task compile examples/modules/main.toss -o out/modules.js
mise exec -- deno run out/modules.js
```

The output contains the dependencies and needs no Toss source files at runtime.

## JavaScript expressions

Use `%js(...)` to evaluate one JavaScript expression. Explicit bindings pass
Toss values into immutable JS locals:

```text
#n bind: 3.
%js(x = $n; Math.max(x, 7)) print.

// A function body may contain statements.
%js((() => { const x = 3; return x * 2; })()) print.

// Object and Array mutations are shared with Toss.
#items bind: [1, 2, 3].
%js(xs = $items; xs.push(4)).
$items dump.
```

Bindings are evaluated once, left to right, in the Toss Environment. JS runs
in strict mode with host globals and the explicit bindings; it does not inherit
the compiler's local variables. Without the binding separator `;`, the whole
body is a JS expression, including assignments. Keep a method call together,
such as `%js(console.log('Hello'))`, to use JS's ordinary `this` rules.

JS strings, finite Numbers and Booleans become ordinary Toss values; `null`
and `undefined` become Nil. Objects, Arrays and Functions become opaque JS
references displayed as `<js>`. Pass a reference back into `%js` to operate on
its original value. References only support `toString`, `inspect`, `print`
and `dump`. Non-finite Numbers, BigInt and Symbol results are runtime errors.

Toss Object, Array and Symbol values pass directly to JS. Nil passes as `null`;
direct Block arguments are rejected. Object and Array contents are not copied
or recursively checked. Use `asJSCallback` below for explicit callback adapters.
Promise results are references and are not automatically awaited. Use Toss
`%await` in an explicit async Block, described below. Outer JavaScript `await`
inside `%js` is still unsupported. JS syntax errors are compile-time errors.
JS exceptions are runtime errors at the macro
position and retain the original thrown value as their cause.

```sh
mise exec -- deno task compile examples/javascript.toss -o out/javascript.js
mise exec -- deno run out/javascript.js
```

The compiler uses a pinned Acorn parser; generated files do not depend on it.
The generated file includes the interop runtime. Host APIs use their normal
permissions and side effects. JS output is not captured by Toss. See
[ADR-38](docs/adr/0038-javascript-expressions.md).

## JavaScript modules

Use `%jsImport('specifier')` to load an ESM namespace as a JS reference. Access
its named or default exports through `%js`:

```text
#path bind: %jsImport('node:path').
%js(module = $path; module.basename('/tmp/hello.txt')) print.

// Deno resolves this pinned npm package when the generated file runs.
#hono bind: %jsImport('npm:hono@4.12.12').
#app bind: %js(module = $hono; new module.Hono()).
```

The argument must be one nonempty literal String with no backslash or ASCII
whitespace/control characters. Bare names, host schemes and absolute URLs are
passed to the host unchanged. Relative paths, root paths and Windows drive
paths are not supported. Bare names use the host's package or import-map setup.

Imports become static namespace imports in the generated ESM file. Identical
specifier strings share one import across bundled Toss files. JS dependencies
initialize before any Toss code, including imports inside uncalled Blocks or
unused Toss dependencies. Compilation does not fetch or execute them. Module
resolution and initialization errors come from the host during ESM loading.
Existing Toss module imports keep their lazy initialization rules.

```sh
mise exec -- deno task compile examples/javascript-imports.toss -o out/javascript-imports.js
mise exec -- deno run --no-config out/javascript-imports.js
mise exec -- deno task compile examples/hono/imports.toss -o out/hono/imports.js
mise exec -- deno run --no-config out/hono/imports.js
```

The Hono import example uses a JS handler to exercise package loading and an
in-memory request. The callback example below uses a Toss handler. Explicit
async Blocks below add Promise waiting inside Toss handlers.
Local macros can generate `%jsImport` at runtime, but cannot load JS modules
during macro expansion. See [ADR-40](docs/adr/0040-static-javascript-imports.md).

## JavaScript callbacks

Convert a Block explicitly with the Prelude message `asJSCallback`:

```text
#callback bind: { n -> $n add: 1 } asJSCallback.
%js(callback = $callback; [1, 2, 3].map(callback).join(',')) print.
```

The adapter is a JS reference. It converts the first N JS arguments for a
Block with N parameters, ignores extra arguments before conversion, and
rejects missing arguments. Explicit `undefined` counts as an argument and
becomes Nil. Ordinary Toss Block calls still require an exact argument count.

Incoming values use the existing JS-to-Toss rules. The result uses the
Toss-to-JS rules: a Response reference returns the original JS Response, Nil
returns `null`, and an ordinary Block result is rejected. Objects and Arrays
are not converted recursively. Promise references can pass through, but the
adapter does not await them or suspend Toss code.

Repeated conversions of the same Block return the same callback and JS
reference. Different Blocks get different callbacks. JS `this` is ignored;
the Block keeps its lexical bindings, `$self`, parent-call context and macro
scope. Each invocation has fresh locals. Body errors propagate to JS unchanged.
An enclosing `%js` still wraps thrown errors as its original cause. Boundary
errors use the first conversion site, including when a cached adapter is reused.

For Hono, a one-parameter Toss Block can use Context and ignore Next:

```text
#handler bind: { context ->
  %js(c = $context; c.text('Hello, Toss!'))
} asJSCallback.
%js(app = $app, handler = $handler; app.get('/', handler)).
```

```sh
mise exec -- deno task compile examples/hono/callbacks.toss -o out/hono/callbacks.js
mise exec -- deno run --no-config out/hono/callbacks.js
```

The complete example uses a Toss handler, path parameters, a JSON response and
native CORS middleware. JS drives the test requests and Promise waiting.
Compile-time macros cannot create host callbacks, but may generate a runtime
conversion. See [ADR-41](docs/adr/0041-javascript-callback-adapters.md).

## Async Blocks and await

Create an async Block with `%async({ parameters -> body })`. It keeps normal
Block messages, lexical bindings, exact arity, `$self` and parent calls. Calling
it starts its body and returns an opaque async result displayed as `<js>`.
Use `%await(expression)` inside that Block to suspend and obtain a value:

```text
#handler bind: %async({ context ->
  #body bind: %await(%js(c = $context; c.req.json())).
  %js(c = $context, body = $body; c.json(body))
}) asJSCallback.
%js(app = $app, handler = $handler; app.post('/echo', handler)).
```

Both forms require an adjacent `(` and one argument; `%async` requires a
literal Block. An await belongs to its directly enclosing async Block. Ordinary
nested Blocks cannot await, even inside an async Block. File-root await and
async Toss module initialization are not supported. Local macros may generate
runtime async forms, but cannot execute them during expansion.

Awaiting a Toss async result preserves its original Toss value and identity,
including Objects, Arrays and Blocks. Awaiting an ordinary value also preserves
it and still suspends. A plain Toss Object's `then` slot is never interpreted
as Promise behavior. A JS reference uses native await/thenable resolution and
the existing JS-to-Toss conversion: a native fulfilled Array stays a JS
reference. The final expression is the Block's Toss result; explicitly await
a nested async result or native Promise when its fulfilled value is needed.

No ordinary message implicitly awaits a result. For a mixed conditional,
await the selected branch and mark only the asynchronous branch:

```text
%await($condition ifTrue: %async({
  %await($promise)
}) ifFalse: {
  42
})
```

Passing a Toss async result to JS exposes a stable Promise whose fulfilled
value uses Toss-to-JS conversion. `asJSCallback` therefore returns a real
Promise of Response to Hono. Internal Toss values are not forced through JS
conversion until exported. Body errors reject with their Toss source position
and macro trace. Native rejections identify the await site and keep their
original value as cause.

```sh
mise exec -- deno task compile examples/hono/verify.toss -o out/hono/verify.js
mise exec -- deno run --no-config out/hono/verify.js
# Start the sample HTTP server on localhost:8000.
mise exec -- deno task compile examples/hono/main.toss -o out/hono/main.js
mise exec -- deno run --no-config --allow-net=127.0.0.1 out/hono/main.js 8000
```

The [Hono sample app](examples/hono/README.md) uses the reusable adapter and
macro sources in [`lib/hono/`](lib/hono/README.md). Runtime helpers use ordinary
`%import`; shared syntax helpers use `%macroImport`. The user app, server entry
and in-memory verifier keep route policy and expectations outside the library.
It awaits JSON request bodies and middleware
`next()`, handles concurrent requests and malformed JSON, and checks middleware
order and response headers without retaining global request logs.
Cancellation, async collection helpers and language-level exception handling
remain future work. See [ADR-42](docs/adr/0042-explicit-async-blocks.md).

## Expression macros

Define a file-private macro with `%macro(#name, { syntax -> ... }).` before
using it. The Block receives unevaluated token-tree syntax and returns syntax
for one expression:

```text
%macro(#show, { syntax ->
    %`((%,($syntax)) print)
}).

%show(1 add: 2).
```

`%quote(...)` returns literal syntax. Quasiquote uses a percent sign followed
by a backtick and parentheses, as above. Inside quasiquote, `%,(expression)`
inserts one syntax object and `%,@(expression)` inserts an Array of syntax
objects. An empty Array inserts nothing. Include punctuation explicitly:

```text
%macro(#pair, { syntax ->
    #items bind: [%quote(1), %quote(,), %quote(2)].
    %`([%,@($items)])
}).
%pair() dump.
```

Syntax is immutable. `kind` returns `#token` or `#group`; groups receive
`children` and `delimiter`, while tokens receive `spelling`. `children` returns
an Array copy, so normal collection messages can transform syntax sequences.
The delimiter is `'()'`, `'[]'`, `'{}'`, or `''` for a fragment.

Introduced bindings do not capture caller variables. Spliced syntax retains
its scope; introduced free references use the macro's definition scope. Named
Symbol values keep their ordinary identity. Returned macro calls expand
recursively, with source-order lookup in their own syntax scopes. Self-calls
in generated syntax are supported; forward references and direct self-expansion
while preparing a definition are errors.

Each expansion has a fresh compile-time Environment. Core messages and syntax
operations are available; runtime file bindings, host output, JS execution and
module loading are not. Quoted output may contain runtime `%js`, `%import`
and `%super` expressions. Expansion adds no method invocation. Diagnostics
retain source positions and macro expansion paths; compiler execution limits
reject excessive expansion or computation.

Quotation is compile-time only. Nested definitions, built-in replacement and
generated declarations are rejected. Intentional caller capture APIs remain
future work. See
[ADR-39](docs/adr/0039-user-defined-expression-macros.md).

Load a macro-only library explicitly before using its definitions:

```text
// helpers.toss
%macro(#show, { syntax -> %`((%,($syntax)) print) }).

// main.toss
%macroImport('./helpers.toss').
%show(1 add: 2).
```

Macro imports require the file compiler, accept relative `.toss` paths, and
take effect at the import position. Libraries contain only macro declarations;
they have no runtime initialization. All definitions are imported. Repeated
imports of the same canonical file are idempotent; conflicting names are
errors. Library imports inside libraries, aliases and selective exports are
deferred. A library is instantiated in each consumer's macro context; its
generated runtime free references use that consumer's file root. Pass runtime
dependencies explicitly to keep macros reusable. See
[ADR-43](docs/adr/0043-macro-library-imports.md).

```sh
mise exec -- deno task compile examples/macros.toss -o out/macros.js
mise exec -- deno run out/macros.js
```

## ✨ Why Toss?

* **Zero Reserved Keywords:** No `class`, `if`, or `let`. Control flows and declarations are elegantly handled through messages and hygienic macros (`%`).
* **Pure Message Passing:** Computation happens exclusively by tossing messages to objects (dictionaries). Unary, keyword, and block messages handle everything.
* **Pipeline by Default:** The `|>` operator allows data to flow naturally from left to right, injecting results as the final argument of the next message.
* **JavaScript Target:** Compiles to JavaScript with runtime support for message dispatch and `$self`. Use `%js(...)` for explicit JavaScript interop; further optimizations are planned.
* **Algebraic Effects Built-in:** Advanced error handling and state management without the `try/catch` boilerplate, powered entirely by blocks and dictionaries.

## 🚀 A Glimpse of the Syntax

This design sketch includes planned statement macros.
The implemented subset and runnable examples are described above.

```
// 1. Statement Macros for clean declarations
#M bind: %import('./math.toss').
%const baseRate = 10.

// 2. Prototype-based inheritance & 3. Block closures
#Dog bind: $Animal clone |> %extend(
    name: 'Pochi',
    bark: { 
        $self name print.
        'Woof!' print 
    }
).

// 4. Pipelines & 5. Message Passing
[1, 2, 3, 4, 5]
    filter: { x -> $(x % 2 == 0) }
    map: { x -> $(x * $baseRate) }
    |> #results bind:.

$Dog bark.
```
