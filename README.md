# Toss ⚾️

> **Everything is a dictionary. Everything is a message. Zero reserved keywords.**

**Toss** (Working Title) is a minimalist, purely object-oriented programming language that distills the most beautiful concepts in computer science history into just **five syntax rules**.

Inspired by the dynamic message-passing of Smalltalk, the metaprogramming power of Lisp, and the frictionless prototype chain of JavaScript, Toss is designed to make coding feel like a lightweight, rhythmic game of catch between objects. It transpiles 1:1 to clean, modern JavaScript, running seamlessly on Node.js and Deno.

## Try the first compiler

The current implementation supports single-quoted strings, named symbols,
bindings and references, unary and keyword messages, expression grouping,
pipelines, blocks and closures with parameters, multiple statements,
and `//` line comments. Macros and effects described below are
design goals and are not implemented yet.

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
Unsupported object messages report `Object`.

```sh
mise exec -- deno task compile examples/objects.toss -o out/objects.js
mise exec -- deno run out/objects.js
```

See [ADR-15](docs/adr/0015-dictionary-objects.md) for the scope of object
message dispatch.

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
`value` remains the zero-argument call. Empty blocks are not supported yet.

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
