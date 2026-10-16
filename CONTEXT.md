# Toss

Toss is a programming language built around dictionaries and message passing.

## Language

**Method**:
A block used as an object's response to a message, with its receiver called `self`.

**Prelude library**:
The library that provides Toss's basic messages, including `print`.

**Environment**:
A dictionary of named bindings. Each file has a root environment, and each block call has a local environment linked to its defining environment.

**Named symbol**:
A value that identifies a name, written as `#name`. Named symbols are interned within one execution, and receive `bind:` to store a value under that name in the current environment.

**Fetch**:
A lookup of the nearest named binding, starting in the current environment and searching outward, written as `$name`. Fetching an unbound name is an error.

**Object**:
A dictionary of slots keyed by strings or symbols. An object can inherit slots from its prototype, and an own slot takes precedence over an inherited one.
