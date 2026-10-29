# Browser REPL example design

Follow the native browser defaults documented in
[the browser example design](../browser/DESIGN.md): browser colors, typography,
spacing, focus indicators, and controls remain the visual tokens. Keep the page
in normal document flow with a labeled Toss input, semantic buttons, a visible
status, and a text-only live transcript. Virtual Toss files use native
fieldsets, legends, labels, text inputs, and textareas; fields fit narrow
viewports. No framework, custom color palette, or external assets are
introduced.

All evaluation belongs to one same-origin module Worker. The page presents
automatic cell results, Toss `print`/`dump` output, and errors as separate
transcript entries. Worker output has session order but no claimed originating
cell, because async Blocks can print after their call returns. Retain only the
most recent 200 transcript entries in the page.

**Reset session** queues a Toss-state reset in the current Worker and leaves the
host JavaScript module cache intact. Editing virtual source files updates the
Worker's source map without resetting its session; Toss imports already cached
by the session keep their previous source until **Reset session**. Reset clears
Toss bindings and Toss module/macro caches while retaining the same Worker and
its JavaScript module cache. **Reload JavaScript modules** terminates and
replaces the Worker, copies the current page edits into it, and clears both
caches. Old-generation messages are ignored. A Worker keeps the page responsive
and separates its globals from the page, but it is not a security sandbox for
arbitrary `%js`.
