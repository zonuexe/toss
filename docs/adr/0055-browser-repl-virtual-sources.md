# ADR-55: Virtual sources in the browser REPL

Allow a browser REPL host to supply a map of virtual Toss source files. Cell
imports resolve from the virtual root; imports inside a file resolve relative
to that file. Source IDs use ADR-52's root-relative POSIX rules. The host does
not read files or fetch sources while resolving Toss or macro imports.

An uncached dependency takes a normalized source-map snapshot for that cell's
preparation. Macro and module loading share the snapshot, and preparation
finishes before asynchronous JavaScript module loading. A queued submission
observes the source map when preparation begins. Ordinary cells and reset do
not need to read the map.

Successfully compiled module and macro-library records stay cached until
reset, including when a source is edited or removed from the map. Failed
preparation or JS loading commits no candidate records. Module initialization
and failure caching follow ADR-46. Reset clears Toss state and source records;
the host JavaScript module cache remains under host control.

When no source map is supplied, file and macro-library imports retain their
browser-core diagnostics. Malformed source maps and missing sources are
reported at the import site. This API does not provide a file editor or a
network source loader.
