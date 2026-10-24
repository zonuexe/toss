import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exampleDirectory = dirname(fileURLToPath(import.meta.url));
const defaultOutputDirectory = resolve(exampleDirectory, "../../out/browser");

const assets = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/strict", { file: "strict.html", type: "text/html; charset=utf-8" }],
  ["/main.js", { file: "main.js", type: "text/javascript; charset=utf-8" }],
  ["/strict.js", { file: "strict.js", type: "text/javascript; charset=utf-8" }],
  ["/blocked.js", {
    file: "blocked.js",
    type: "text/javascript; charset=utf-8",
  }],
  ["/host.js", { file: "host.js", type: "text/javascript; charset=utf-8" }],
  ["/strict-host.js", {
    file: "strict-host.js",
    type: "text/javascript; charset=utf-8",
  }],
]);

export function createBrowserHandler(
  outputDirectory = defaultOutputDirectory,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const asset = assets.get(new URL(request.url).pathname);
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
      headers.set(
        "content-security-policy",
        "default-src 'self'; script-src 'self' 'unsafe-eval' 'nonce-toss-browser'; object-src 'none'; base-uri 'none'",
      );
    } else if (asset.file === "strict.html") {
      headers.set(
        "content-security-policy",
        "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'",
      );
    }
    return new Response(body, { headers });
  };
}

function parsePort(argument: string | undefined): number {
  if (argument === undefined) return 8000;
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
  const port = parsePort(Deno.args[0]);
  Deno.serve({ hostname: "127.0.0.1", port }, createBrowserHandler());
}
