# Toss ⚾️

> **Everything is a dictionary. Everything is a message. Zero reserved keywords.**

**Toss** (Working Title) is a minimalist, purely object-oriented programming language that distills the most beautiful concepts in computer science history into just **five syntax rules**.

Inspired by the dynamic message-passing of Smalltalk, the metaprogramming power of Lisp, and the frictionless prototype chain of JavaScript, Toss is designed to make coding feel like a lightweight, rhythmic game of catch between objects. It transpiles 1:1 to clean, modern JavaScript, running seamlessly on Node.js and Deno.

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
