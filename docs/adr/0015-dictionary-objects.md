# ADR-15: Dictionary objects and prototype cloning

Each generated file starts with a fresh `Object` binding. Its value is a native
JavaScript object with no prototype. It is an ordinary environment binding, so
blocks can fetch it and a local binding with the same name can shadow it.

`Object` provides `clone`, `at:`, and `at:put:`. Cloning makes a new object whose
prototype is the receiver and copies no own slots. A child sees later parent
updates until it writes an override of its own. Reads walk the prototype chain;
writes define an own writable, enumerable data slot and return the value.

Keys can be strings or symbols. String and symbol keys have separate identity.
Missing keys and invalid key types are runtime errors at the message location.
Stored values are returned unchanged, including blocks, which are not invoked by
`at:`. Defining slots uses data-property semantics, so names such as `__proto__`,
`constructor`, and `toString` are ordinary keys.

Object messages in this step resolve through the object prelude. An unsupported
message reports `Object`. User slot-to-message dispatch, automatic method calls,
`$self`, custom object display, macros, module loading, and new primitives are
outside this decision.
