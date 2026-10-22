# Toss

Toss is a programming language built around dictionaries and message passing.

## Language

**Method**:
A block used as an object's response to a message, with its receiver called `self`.

**Parent call**:
A call under the current method key that starts above the selected slot's owner and keeps the original receiver. Arguments are always explicit.

**Prelude library**:
The library that provides Toss's basic messages, including `print`.

**Macro**:
A compile-time transformation of syntax. Named macros use `%name`.

**Syntax object**:
An immutable token or group that keeps source position and lexical scope. Arrays can hold syntax objects for inspection and assembly by macros.

**Annotation**:
A modifier of invocation behavior, planned with the prefix `@name`. Its declaration selects runtime invocation or compile-time expansion.

**Attribute**:
Data attached to a target, without invocation interception of its own. Its representation is undecided.

**Environment**:
A dictionary of named bindings. Each file has a root environment, and each block call has a local environment linked to its defining environment.

**Module**:
A Toss file with private bindings and one public value. Local imports share the same initialized value for each canonical file within an execution.

**JS reference**:
An opaque Toss value that holds a JavaScript object or function. JavaScript expressions can use the original value, while Toss messages only provide its display.

**JS module**:
A host JavaScript module with an ESM namespace of named exports, including a possible default export. It is separate from a Toss Module.

**JS callback adapter**:
A host function that converts arguments, runs a lexical Toss Block, and converts its result for JavaScript callers.

**Async Block**:
A lexical Block that can suspend while waiting for a value. Calling it starts its body and returns an async result.

**Async result**:
The pending or completed result of an Async Block call. Waiting for it preserves the original Toss value; JavaScript callers receive a Promise.

**Named symbol**:
A value that identifies a name, written as `#name`. Named symbols are interned within one execution, and receive `bind:` to store a value under that name in the current environment.

**Unique symbol**:
A Symbol with fresh identity on every creation, independent of any name. Possession of the key allows access to slots stored under it.

**Fetch**:
A lookup of the nearest named binding, starting in the current environment and searching outward, written as `$name`. Fetching an unbound name is an error.

**Object**:
A dictionary of slots keyed by strings or symbols. An object can inherit slots from its prototype, and an own slot takes precedence over an inherited one.

**Nil**:
The absent-result value.

**Number**:
A numeric value used for arithmetic and ordering.

**Boolean**:
A value that is either true or false.

**Array**:
A mutable, ordered sequence of values accessed by zero-based indexes.
