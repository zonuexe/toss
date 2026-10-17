# ADR-29: String keys in object extensions

`#extend` accepts single-quoted string literals followed by `:` as entry
labels. This extends [ADR-28](0028-extend-macro.md) without changing its update,
evaluation, Environment, receiver-return, or error behavior.

```text
#counter bind: ($Object clone |> #extend(
  base: 10,
  'add:': { n -> $self base add: $n },
  'add:with:': { a, b -> ($self base add: $a) add: $b }
)).
($counter add: 3) print.
($counter add: 3 with: 4) print.
```

Quoted labels keep their complete decoded string. Bare `name:` writes the
key `'name'`, while `'name:':` writes the different key `'name:'`. Ordinary
message dispatch uses complete selectors such as `'add:with:'`, enabling
keyword Methods. Their argument counts and actual `$self` follow the existing
runtime rules; installing a Block does not invoke or validate its arity.

Any string key is valid, including empty strings, Unicode, spaces, and
punctuation. Keys that are not message names remain accessible through `at:`.
Use the existing single-quoted String rules: only `\\` and `\'` decode as
escapes. No interpolation or new escape sequences are added. Whitespace and
line comments may separate the literal from its required `:`.

Bare and quoted labels can be mixed. Equivalent decoded string keys share the
same slot and overwrite in source order. Named-symbol keys remain distinct.
Quoted entries send normal `at:put:` too: installing an `'at:put:'` override
changes how subsequent entries are written. There is no privileged setter.
Implicit setter errors point to the opening quote of a quoted label; value
and method-body errors keep their own source locations.

Quoted labels are only accepted inside `#extend`.
[ADR-30](0030-extend-dynamic-keys.md) adds parenthesized key expressions.
Unparenthesized symbol labels remain unsupported. This string-label step
requires no AST, code generation, runtime, or selector type-checking extension.

```sh
mise exec -- deno task compile examples/extend-string-keys.toss -o out/extend-string-keys.js
mise exec -- deno run out/extend-string-keys.js
```
