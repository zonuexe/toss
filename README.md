# Toss ⚾️

> **Everything is a dictionary. Everything is a message. Zero reserved keywords.**

**Toss** (Working Title) is a minimalist, purely object-oriented programming language that distills the most beautiful concepts in computer science history into just **five syntax rules**.

Inspired by the dynamic message-passing of Smalltalk, the metaprogramming power of Lisp, and the frictionless prototype chain of JavaScript, Toss is designed to make coding feel like a lightweight, rhythmic game of catch between objects. It transpiles 1:1 to clean, modern JavaScript, running seamlessly on Node.js and Deno.

## Try the first compiler

The current implementation supports single-quoted strings, named symbols,
bindings and references, unary and keyword messages, expression grouping,
pipelines, blocks and closures with parameters, Nil and empty blocks,
multiple statements, and `//` line comments. The built-in arithmetic macro is
available as `$(1 + 2 * 3)` and lowers operators to ordinary messages. Its
operands are limited to numbers, `$name` fetches, arithmetic groups, and nested
arithmetic macros; unary and keyword messages inside operands are not accepted.
It also supports `<`, `<=`, `>`, `>=`, `==`, and `!=`, with one comparison per
unparenthesized arithmetic group. Other macro forms and effects remain design
goals. See
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

## ✨ Why Toss?

* **Zero Reserved Keywords:** No `class`, `if`, or `let`. Control flows and declarations are elegantly handled through messages and hygienic macros (`#`).
* **Pure Message Passing:** Computation happens exclusively by tossing messages to objects (dictionaries). Unary, keyword, and block messages handle everything.
* **Pipeline by Default:** The `|>` operator allows data to flow naturally from left to right, injecting results as the final argument of the next message.
* **Seamless JS Interop & Transpilation:** Compiles perfectly to JavaScript with zero runtime overhead. Hygenic α-conversion handles `$self` binding automatically.
* **Algebraic Effects Built-in:** Advanced error handling and state management without the `try/catch` boilerplate, powered entirely by blocks and dictionaries.

## 🚀 A Glimpse of the Syntax

```
// 1. Statement Macros for clean declarations
#import $Math as: M.
#const baseRate = 10.

// 2. Prototype-based inheritance & 3. Block closures
#Dog bind: $Animal clone |> #extend(
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
