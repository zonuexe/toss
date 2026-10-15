# Toss

Toss is a programming language built around dictionaries and message passing.

## Language

**Prelude library**:
The library that provides Toss's basic messages, including `print`.

**Environment**:
The dictionary of named bindings belonging to a Toss file.

**Named symbol**:
A value that identifies a name, written as `#name`. Named symbols are interned within one execution, and receive `bind:` to store a value under that name in the current environment.

**Fetch**:
A lookup of a named binding in the current environment, written as `$name`. Fetching an unbound name is an error.
