import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exampleDirectory = dirname(fileURLToPath(import.meta.url));
const defaultOutputDirectory = resolve(
  exampleDirectory,
  "../../out/browser-repl",
);

const assets = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
  ["/worker.js", {
    file: "worker.js",
    type: "text/javascript; charset=utf-8",
  }],
  ["/worker-client.js", {
    file: "worker-client.js",
    type: "text/javascript; charset=utf-8",
  }],
  ["/source-list.js", {
    file: "source-list.js",
    type: "text/javascript; charset=utf-8",
  }],
  ["/repl-core.js", {
    file: "repl-core.js",
    type: "text/javascript; charset=utf-8",
  }],
  ["/style.css", { file: "style.css", type: "text/css; charset=utf-8" }],
  ["/demo-module.js", {
    file: "demo-module.js",
    type: "text/javascript; charset=utf-8",
  }],
]);

const pagePolicy =
  "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'";
const workerPolicy =
  "default-src 'self'; script-src 'self' 'unsafe-eval'; connect-src 'none'; object-src 'none'; base-uri 'none'";

export function createBrowserReplHandler(
  outputDirectory = defaultOutputDirectory,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const pathname = new URL(request.url).pathname;
    const asset = assets.get(pathname);
    if (asset === undefined) return new Response("Not found", { status: 404 });
    let body: string;
    try {
      body = await Deno.readTextFile(resolve(outputDirectory, asset.file));
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return new Response("Not found", { status: 404 });
      }
      throw error;
    }
    const headers = new Headers({ "content-type": asset.type });
    if (asset.file === "index.html") {
      headers.set("content-security-policy", pagePolicy);
    } else if (asset.file === "worker.js") {
      headers.set("content-security-policy", workerPolicy);
    }
    return new Response(body, { headers });
  };
}

function parsePort(argument: string | undefined): number {
  if (argument === undefined) return 8010;
  if (!/^\d+$/.test(argument)) {
    throw new TypeError("Port must be an integer from 1 to 65535.");
  }
  const port = Number(argument);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError("Port must be an integer from 1 to 65535.");
  }
  return port;
}

if (import.meta.main) {
  if (Deno.args.length > 1) {
    throw new TypeError("Expected at most one port argument.");
  }
  Deno.serve(
    { hostname: "127.0.0.1", port: parsePort(Deno.args[0]) },
    createBrowserReplHandler(),
  );
}
