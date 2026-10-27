# ADR-51: Optional prelude tree-shaking

Allow ahead-of-time embedded output to keep only prelude messages that the
expanded program may send. The default includes the full prelude. The
compiler examines the complete Toss module bundle, including macro output and
Block bodies, and keeps each used selector in every prelude type table. It
also keeps selectors used by the runtime for display and object extension.

Dynamic `perform:`, parent calls and JavaScript interop can change which
messages are reached. If any occurs, keep the full prelude for that artifact.
The REPL and generated external runtime module also keep the complete prelude;
a shared runtime cannot be specialized for a single artifact. Requesting
tree-shaking with an external runtime import is an error.

The analysis only sees the Toss bundle. Host JavaScript outside the bundle can
modify built-in JavaScript behavior, such as `Map.prototype.get`, before or
after a generated module loads. Such changes can make an omitted message
reachable. Use the full prelude when the host changes runtime built-ins.

The `--tree-shake-prelude` option selects this optimization; the compiler API
uses `treeShakePrelude: true`. Output remains ordinary JavaScript, and host
JavaScript imports retain their existing initialization behavior.
