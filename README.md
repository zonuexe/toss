# Toss ⚾️

> **Everything is a dictionary. Everything is a message. Zero reserved keywords.**

**Toss** (Working Title) is a minimalist, purely object-oriented programming language that distills the most beautiful concepts in computer science history into just **five syntax rules**.

Inspired by the dynamic message-passing of Smalltalk, the metaprogramming power of Lisp, and the frictionless prototype chain of JavaScript, Toss is designed to make coding feel like a lightweight, rhythmic game of catch between objects. It transpiles 1:1 to clean, modern JavaScript, running seamlessly on Node.js and Deno.

## Try the first compiler

The current implementation supports single-quoted strings, named symbols,
bindings and references, unary and keyword messages, multiple statements, and
`//` line comments. Blocks, macros, pipelines, and effects described below are
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
keyword messages fail at runtime. Grouping parentheses remain unsupported.

```sh
mise exec -- deno task compile examples/bindings.toss -o out/bindings.js
mise exec -- deno run out/bindings.js
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
