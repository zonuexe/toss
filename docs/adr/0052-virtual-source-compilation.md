# ADR-52: Compile virtual source files

Provide `compileSources(entry, sources, options)` for hosts that have Toss
source strings but no filesystem. It compiles the entry and its static Toss
module and macro library dependencies into one JavaScript artifact. It does
not read files, fetch imports or execute program code while compiling.

`sources` maps root-relative POSIX paths to source strings. Normalize `.` and
`..` path segments to identify each virtual file, reject paths that escape the
virtual root and reject duplicate normalized keys. Resolve relative `.toss`
imports from their importing file. Aliases of the same normalized path share
one module identity and initialization cache. This virtual host has no
filesystem symlinks. Missing sources and import cycles are compilation errors.

Macro library imports use the same virtual source map and keep ADR-43's
per-consumer behavior. JavaScript module specifiers remain host-resolved in
the generated artifact. Filesystem compilation continues to use real paths,
including symlink identity and output-overwrite checks.
