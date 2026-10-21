# ADR-28: Extend object slots with a pipeline macro

The macro spelling is updated to `%extend` by
[ADR-32](0032-macro-and-annotation-sigils.md); the behavior below is unchanged.

`input |> %extend(name: value, method: { ... })` updates the input object and
returns that same object. It does not clone it. Use `clone` explicitly when a
new child is needed. This adds a built-in macro on a pipeline's right side to
the keyword-message pipelines in [ADR-12](0012-pipeline-final-argument.md).
Further pipeline stages work normally; group the full pipeline before sending
messages to its result.

The opener must be the exact adjacent text `%extend(`. A plain `#extend` remains
an ordinary named symbol, including in `#extend bind:`. The macro is recognized
independently of that symbol's runtime binding. Standalone `%extend(...)` has no
target and is a syntax error. Other named macros remain deferred.

Entries use ASCII identifier labels followed by full Toss expressions. `name:`
means the string key `'name'`, not a symbol or a keyword selector containing a
colon. Commas separate entries; trailing commas and holes are errors. Empty
`%extend()` is allowed. [ADR-29](0029-extend-string-keys.md) adds quoted string
keys, including keyword-method selectors. [ADR-30](0030-extend-dynamic-keys.md)
adds parenthesized key expressions, including symbol-valued keys.

Evaluate the input once, then require an Object before evaluating any entries,
even for an empty extension. Nil, Arrays, Blocks, and other primitive values
are runtime errors at the macro opener. For each entry from left to right,
evaluate its value once, then send ordinary `at:put:` immediately with the
string key and value. Ignore the setter's result and finally return the input.
Own and inherited setter overrides keep their normal dispatch and actual
receiver. With the default setter, repeated keys overwrite earlier values and
inherited slots receive own overrides; safe data-property rules still apply.

Values run in the caller's existing Environment. The macro creates no Toss
bindings, local Environment, or implicit `$self`. Blocks are stored without
being called; when used as Methods they follow [ADR-16](0016-method-dispatch-and-self.md).
Generated JavaScript temporaries must not capture user bindings or change the
Environment captured by a Block. A wrapper Toss Block would change `bind:` and
is therefore unsuitable for this expansion.

If a value or setter fails, stop before later values. Earlier writes remain;
there is no rollback. Value and method-body errors retain their original
locations. Implicit setter errors use the entry label's location.

```text
#Dog bind: ($Object clone |> %extend(
  name: 'Pochi',
  bark: { $self name print }
)).
$Dog bark.
```

Compile and run the example:

```sh
mise exec -- deno task compile examples/extend.toss -o out/extend.js
mise exec -- deno run out/extend.js
```
