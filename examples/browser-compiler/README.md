# Browser compiler example

This page compiles virtual Toss source files in your browser and displays the
generated JavaScript as text. It starts with `main.toss` and `math.toss`; add,
rename, or remove source entries and choose the entry path to experiment with
local module and macro imports. New files start at a predictable virtual path;
the added path field receives focus. Duplicate paths and missing entry sources
are reported when you compile. After a successful compile, use **Download
JavaScript module** to save the displayed code as an `.mjs` file. Editing any
source or changing the entry disables the download until the next successful
compile. External JavaScript import specifiers remain for the host application
to resolve when it later uses the downloaded module. You can select local
`.toss` files to add their contents to the editor; each file's name becomes its
virtual path because the file picker does not preserve directory structure.
Selection is all-or-nothing and stays in the browser; files are not uploaded or
saved. The page never executes source or generated output.

Build the browser bundle and serve it on loopback:

```sh
deno run --allow-read --allow-write --allow-run=deno examples/browser-compiler/build.ts
deno run --allow-read=out/browser-compiler --allow-net=127.0.0.1:8010 examples/browser-compiler/server.ts
```

Open <http://127.0.0.1:8010>. The build bundles the source compiler and Acorn
into a local browser module. The first build may download Deno's bundler
dependency. The served page uses only local files; compilation runs in the page
without a compiler service or `unsafe-eval`.
