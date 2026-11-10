// Keep the exploratory probes separate from the production test suite.
await import("./effects-one-shot.mjs");
await import("./effects-cleanup-errors.mjs");
await import("./effects-boundaries.mjs");
await import("./effects-module-state.mjs");
await import("./effects-codegen-boundary.mjs");
await import("./effects-codegen-map.mjs");
await import("./effects-module-boundary.mjs");
await import("./effects-codegen-module.mjs");
await import("./effects-codegen-super.mjs");
await import("./effects-codegen-handler.mjs");
await import("./effects-compiler-test.mjs");
await import("./effects-compiler-conformance.mjs");
