# Browser compiler example

This page compiles two Toss source files in your browser and displays the
generated JavaScript as text. The `main.toss` and `math.toss` fields form the
complete source map for the example; imports and macro libraries resolve only
between those two fields. It is not a general file picker. The page does not
execute the output or send source anywhere.

Build the browser bundle and serve it on loopback:

```sh
deno run --allow-read --allow-write --allow-run=deno examples/browser-compiler/build.ts
deno run --allow-read=out/browser-compiler --allow-net=127.0.0.1:8010 examples/browser-compiler/server.ts
```

Open <http://127.0.0.1:8010>. The build bundles the source compiler and Acorn
into a local browser module. The first build may download Deno's bundler
dependency. The served page uses only local files; compilation runs in the page
without a compiler service or `unsafe-eval`.
