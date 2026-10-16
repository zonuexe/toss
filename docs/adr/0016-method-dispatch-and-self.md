# ADR-16: Dictionary methods and lexical self

For dictionary objects, a string slot matching the complete message selector has
priority over object prelude messages. Lookup includes inherited slots. String
keys and symbol keys remain distinct; identifier messages use string keys.
Dynamic `perform:` and symbol-key selector syntax are deferred.

A block in a matching slot is called with the message arguments and the
receiving object as `self`. A non-block slot is returned for a unary message;
arguments to a non-block slot are a runtime error. Slots may intentionally
override prelude messages. `at:` continues to return stored blocks as data.

Methods retain the lexical environment where their block was created. Each
invocation creates its usual local environment and binds `self` to the actual
receiver before parameter bindings. Parameters and `bind:` may shadow `self`.
Nested blocks capture that environment, so returned blocks retain `self` after
the method returns. Calling a block through `value` or `value:` does not rebind
`self`; it uses a lexically captured binding, if one exists. A block stored as a
method receives the new receiver on each method call.

Objects also receive `print` and `dump` as prelude fallbacks. They send
`toString` and `inspect` through the usual message protocol and require a string
result. No default object representation is provided; missing conversions remain
unknown-message errors. Dangerous names remain ordinary data properties.
