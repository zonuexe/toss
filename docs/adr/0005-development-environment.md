# ADR-5: Manage Deno with mise

Use mise as the standard tool manager for this repo and install Deno through it.
Pin the Deno version in the root `mise.toml` so developers use the same version.
The compiler uses TypeScript and the first compile-and-run interface is defined in [ADR-7](0007-literal-characters-and-compiler-interface.md).
