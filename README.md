# Toss ⚾️

> **Everything is a dictionary. Everything is a message. Zero reserved keywords.**

**Toss** (Working Title) is a minimalist, purely object-oriented programming language that distills the most beautiful concepts in computer science history into just **five syntax rules**.

Inspired by the dynamic message-passing of Smalltalk, the metaprogramming power of Lisp, and the frictionless prototype chain of JavaScript, Toss is designed to make coding feel like a lightweight, rhythmic game of catch between objects. It transpiles 1:1 to clean, modern JavaScript, running seamlessly on Node.js and Deno.

## Try the first compiler

The first implementation supports single-quoted strings, unary message chains,
multiple statements, and `//` line comments. Other language features described
below are design goals and are not implemented yet.

Use mise to install the pinned Deno version, then compile and run the example:

```sh
mise install
mise exec -- deno task compile examples/hello.toss -o out/hello.js
mise exec -- deno run out/hello.js
```

The example prints `Hello, Toss!`. The generated JavaScript includes its prelude
and runtime code and needs no imports. Generated files under `out/` are ignored
by Git.

The prelude's `print` message writes a string followed by a newline and returns
the same string. `'World' print print.` therefore prints `World` twice.
Single-quoted strings decode only `\\` and `\'`; literal tabs and line breaks
are preserved. Unknown messages fail at runtime. Syntax and message errors
report the original Toss file, line, and column and exit with a nonzero status.

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
