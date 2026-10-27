import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { buildBrowserCompilerExample } from "../examples/browser-compiler/build.ts";
import {
  createBrowserCompilerHandler,
} from "../examples/browser-compiler/server.ts";
import { executeModuleProbe, text } from "./helpers.ts";

class FakeElement {
  textContent = "";
  readonly listeners = new Map<string, () => void>();

  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }
}

class FakeTextArea extends FakeElement {
  value = "";
}

class FakeButton extends FakeElement {
  click(): void {
    this.listeners.get("click")?.();
  }
}

Deno.test("browser compiler bundle compiles Toss source and client recovers after errors", async () => {
  const outputDirectory = await Deno.makeTempDir({
    prefix: "toss-browser-compiler-",
  });
  const originalDocument = Reflect.get(globalThis, "document");
  const originalTextArea = Reflect.get(globalThis, "HTMLTextAreaElement");
  const originalButton = Reflect.get(globalThis, "HTMLButtonElement");
  const originalHtmlElement = Reflect.get(globalThis, "HTMLElement");
  try {
    await buildBrowserCompilerExample(outputDirectory);
    const compilerPath = `${outputDirectory}/compiler.js`;
    const compilerModule: unknown = await import(
      pathToFileURL(compilerPath).href
    );
    assert.ok(typeof compilerModule === "object" && compilerModule !== null);
    const compiler: unknown = Reflect.get(compilerModule, "compileSources");
    assert.equal(typeof compiler, "function");
    if (typeof compiler !== "function") {
      throw new Error("Missing compile export");
    }
    const generated = compiler(
      "main.toss",
      new Map([
        ["main.toss", "%export(%import('./math.toss'))."],
        ["math.toss", "%export(40 add: 2)."],
      ]),
      { format: "esm" },
    );
    assert.equal(typeof generated, "string");
    const execution = await executeModuleProbe(
      generated,
      "console.log(namespace.default);",
    );
    assert.equal(execution.code, 0, text(execution.stderr));
    assert.equal(text(execution.stdout), "42\n");

    const mainSource = new FakeTextArea();
    mainSource.value = "%export(%import('./math.toss')).";
    const mathSource = new FakeTextArea();
    mathSource.value = "%export(40 add: 2).";
    const button = new FakeButton();
    const status = new FakeElement();
    const output = new FakeTextArea();
    const elements = new Map([
      ["#main-source", mainSource],
      ["#math-source", mathSource],
      ["#compile", button],
      ["#status", status],
      ["#output", output],
    ]);
    const fakeDocument = {
      querySelector(selector: string): FakeElement | null {
        return elements.get(selector) ?? null;
      },
    };
    assert.equal(Reflect.set(globalThis, "document", fakeDocument), true);
    assert.equal(
      Reflect.set(globalThis, "HTMLTextAreaElement", FakeTextArea),
      true,
    );
    assert.equal(
      Reflect.set(globalThis, "HTMLButtonElement", FakeButton),
      true,
    );
    assert.equal(Reflect.set(globalThis, "HTMLElement", FakeElement), true);
    const appPath = `${outputDirectory}/app.js`;
    await import(`${pathToFileURL(appPath).href}?browser-test`);
    button.click();
    assert.equal(status.textContent, "Compilation succeeded.");
    assert.match(output.value, /export default/);
    mainSource.value = "'unfinished";
    button.click();
    assert.equal(output.value, "");
    assert.match(status.textContent, /Unterminated string/);
    mainSource.value = "%export(%import('./math.toss')).";
    mathSource.value = "%export(7).";
    button.click();
    assert.equal(status.textContent, "Compilation succeeded.");
    assert.match(output.value, /export default/);
  } finally {
    await Deno.remove(outputDirectory, { recursive: true });
    if (originalDocument === undefined) {
      Reflect.deleteProperty(globalThis, "document");
    } else Reflect.set(globalThis, "document", originalDocument);
    if (originalTextArea === undefined) {
      Reflect.deleteProperty(globalThis, "HTMLTextAreaElement");
    } else Reflect.set(globalThis, "HTMLTextAreaElement", originalTextArea);
    if (originalButton === undefined) {
      Reflect.deleteProperty(globalThis, "HTMLButtonElement");
    } else Reflect.set(globalThis, "HTMLButtonElement", originalButton);
    if (originalHtmlElement === undefined) {
      Reflect.deleteProperty(globalThis, "HTMLElement");
    } else Reflect.set(globalThis, "HTMLElement", originalHtmlElement);
  }
});

Deno.test("browser compiler server serves only built assets with a strict CSP", async () => {
  const outputDirectory = await Deno.makeTempDir({
    prefix: "toss-browser-compiler-server-",
  });
  try {
    await buildBrowserCompilerExample(outputDirectory);
    const handle = createBrowserCompilerHandler(outputDirectory);
    const page = await handle(new Request("http://localhost/"));
    const app = await handle(new Request("http://localhost/app.js"));
    const style = await handle(new Request("http://localhost/style.css"));
    const compiler = await handle(new Request("http://localhost/compiler.js"));
    const missing = await handle(new Request("http://localhost/input.toss"));
    const traversal = await handle(
      new Request("http://localhost/%2e%2e/deno.json"),
    );
    assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(
      page.headers.get("content-security-policy"),
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'",
    );
    assert.equal(
      app.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assert.equal(style.headers.get("content-type"), "text/css; charset=utf-8");
    assert.equal(
      compiler.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assert.equal(missing.status, 404);
    assert.equal(traversal.status, 404);
  } finally {
    await Deno.remove(outputDirectory, { recursive: true });
  }
});
