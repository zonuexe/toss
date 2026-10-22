# ADR-36: Explicit parent calls

The user confirmed this specification after a design interview. `%super()`
calls the parent implementation of the current method key with zero arguments;
`%super(expr, expr)` passes exactly the explicit values. Never forward the
current method's arguments implicitly. Arbitrary ancestor selection and calls
under a different key are outside this feature.

The opener is the exact adjacent text `%super(`. Its comma-separated arguments
are full Toss expressions, using the caller's existing Environment. Empty
arguments, trailing commas and inner statement periods are syntax errors.
The macro is a primary expression: its result can receive messages or enter a
pipeline. It does not expand the arithmetic macro's operand grammar. `#super`
remains a normal Named symbol, independent of the built-in macro.

## Lookup and receiver

An Object method invocation records the actual receiver, exact String or
Symbol key and Object owning the selected slot. Search from that owner's
prototype, preserving the actual receiver as `self`. In A <- B <- C, when C
inherits B's override, that override's parent call starts at A, not B. A parent
method that calls `%super` continues above its own selected slot owner.

The key includes its exact Symbol identity, including Unique symbols. A shared
or moved Block has no permanent definition owner: each method invocation uses
the slot owner and key selected for that invocation. The recorded receiver is
independent of any parameter or local binding named `self`.

An ancestor's non-block slot returns its exact value when no arguments are
passed, including Nil. Passing arguments to it is a not-callable runtime
error; do not skip it to search farther. After exhausting ancestor slots,
String keys can select Object prelude fallbacks. Symbol keys cannot. Before
entering a prelude, validate exact argument count using its selector's colon
count, as with `perform:withArguments:`. Do not restart lookup at the receiver.

## Closures and live changes

Nested Blocks capture parent-call context when created and can use it after
the method returns. Ordinary `value` calls and callbacks use captured context,
not the invoking method's context. A Block installed as a method instead gets
fresh context for that method invocation, overriding any captured context.
A root-defined Block containing `%super` can become a method later; defining
such a Block is not itself an error.

Retain references to the receiver, key and owner, rather than capturing a
parent implementation. Resolve parent slots live each time `%super` executes.
Changes made before a delayed call, or while evaluating arguments, are visible.

## Evaluation and errors

Evaluate explicit arguments once, left to right, before checking method
context, looking up a parent or invoking it. Argument effects happen even
before missing-context or missing-parent errors. An argument failure stops
later arguments and the parent call. Introduce no new Toss scope or binding.

Missing context or parent, non-callable slots and invocation arity errors are
runtime errors at the opening `%` of the macro. Argument and selected-body
errors retain their own source locations. A failing call stops later statements.
Both ordinary and dynamic method sends follow the same context rules.

```text
#Base bind: ($Object clone |> %extend(
  base: 10,
  'score:': { n -> $self base add: $n }
)).
#Middle bind: ($Base clone |> %extend(
  'score:': { n -> %super($n add: 1) add: 2 }
)).
#Leaf bind: ($Middle clone |> %extend(base: 20)).
($Leaf score: 3) print.
```
