import assert from "node:assert/strict";
import { buildBrowserExample } from "../examples/browser/build.ts";
import { createBrowserHandler } from "../examples/browser/server.ts";

type FakeElement = {
  readonly dataset: Record<string, string>;
  textContent: string;
  disabled: boolean;
  readonly children: FakeElement[];
  append(child: FakeElement): void;
  remove(): void;
  addEventListener(name: string, listener: () => void): void;
  click(): void;
};

function fakeElement(): FakeElement {
  const listeners = new Map<string, () => void>();
  return {
    dataset: {},
    textContent: "",
    disabled: false,
    children: [],
    append(child) {
      this.children.push(child);
    },
    remove() {},
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    click() {
      listeners.get("click")?.();
    },
  };
}

function fakeDocument(): {
  readonly document: {
    querySelector(selector: string): FakeElement;
    createElement(_tag: string): FakeElement;
  };
  readonly status: FakeElement;
  readonly results: FakeElement;
  readonly button: FakeElement;
} {
  const status = fakeElement();
  const results = fakeElement();
  const button = fakeElement();
  const elements = new Map([
    ["#status", status],
    ["#results", results],
    ["#callback-button", button],
  ]);
  return {
    document: {
      querySelector(selector) {
        const element = elements.get(selector);
        if (element === undefined) {
          throw new Error(`Unexpected selector ${selector}`);
        }
        return element;
      },
      createElement: () => fakeElement(),
    },
    status,
    results,
    button,
  };
}

Deno.test("browser example build emits Toss modules and local host assets", async () => {
  const outputDirectory = await Deno.makeTempDir({
    prefix: "toss-browser-build-",
  });
  try {
    await buildBrowserExample(outputDirectory);
    const main = await Deno.readTextFile(`${outputDirectory}/main.js`);
    const strict = await Deno.readTextFile(`${outputDirectory}/strict.js`);
    const blocked = await Deno.readTextFile(`${outputDirectory}/blocked.js`);
    assert.match(main, /from "browser-demo"/);
    assert.match(main, /initializeModule/);
    assert.doesNotMatch(strict, /import \* as __tossJavaScriptImport/);
    assert.match(blocked, /evaluateJavaScript/);
    for (
      const asset of ["index.html", "strict.html", "host.js", "strict-host.js"]
    ) {
      const info = await Deno.stat(`${outputDirectory}/${asset}`);
      assert.equal(info.isFile, true);
    }
  } finally {
    await Deno.remove(outputDirectory, { recursive: true });
  }
});

Deno.test("browser host requires checks, updates callback results, and keeps failures", async () => {
  const emptyPage = fakeDocument();
  assert.equal(Reflect.set(globalThis, "document", emptyPage.document), true);
  const missingChecksUrl = new URL(
    "../examples/browser/host.js",
    import.meta.url,
  );
  missingChecksUrl.search = "?missing-checks";
  try {
    const emptyHost = await import(missingChecksUrl.href);
    emptyHost.complete();
    assert.equal(emptyPage.status.dataset["status"], "fail");

    const page = fakeDocument();
    assert.equal(Reflect.set(globalThis, "document", page.document), true);
    const hostUrl = new URL("../examples/browser/host.js", import.meta.url);
    hostUrl.search = "?callback-checks";
    const host = await import(hostUrl.href);
    for (
      const name of [
        "arithmetic",
        "Array map",
        "private module closure",
        "JS namespace identity",
        "Async Block and Promise",
      ]
    ) host.record(name, true, true);
    host.installCallback((value: number) => {
      if (value === 43) throw new Error("callback failure captured");
      return value + 2;
    });
    host.complete();
    assert.equal(page.status.dataset["status"], "pass");
    page.button.click();
    page.button.click();
    assert.ok(
      page.results.children.some((item) =>
        item.textContent.includes(
          "button callback #1: expected 43, observed 43",
        )
      ),
    );
    assert.ok(
      page.results.children.some((item) =>
        item.textContent.includes(
          "button callback #2: expected 44, observed 44",
        )
      ),
    );
    page.button.click();
    host.complete();
    assert.equal(page.status.dataset["status"], "fail");
    assert.ok(
      page.results.children.some((item) =>
        item.textContent.includes("callback failure captured")
      ),
    );
  } finally {
    assert.equal(Reflect.deleteProperty(globalThis, "document"), true);
  }
});

Deno.test("browser handler serves explicit routes with MIME and separate CSP", async () => {
  const outputDirectory = await Deno.makeTempDir({
    prefix: "toss-browser-server-",
  });
  try {
    await buildBrowserExample(outputDirectory);
    const handle = createBrowserHandler(outputDirectory);
    const main = await handle(new Request("http://localhost/"));
    const strict = await handle(new Request("http://localhost/strict"));
    const module = await handle(new Request("http://localhost/main.js"));
    const missing = await handle(new Request("http://localhost/private.toss"));
    const traversal = await handle(
      new Request("http://localhost/%2e%2e/deno.json"),
    );
    assert.equal(main.headers.get("content-type"), "text/html; charset=utf-8");
    assert.match(
      main.headers.get("content-security-policy") ?? "",
      /unsafe-eval/,
    );
    assert.match(
      main.headers.get("content-security-policy") ?? "",
      /nonce-toss-browser/,
    );
    assert.equal(
      strict.headers.get("content-type"),
      "text/html; charset=utf-8",
    );
    assert.equal(
      strict.headers.get("content-security-policy"),
      "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'",
    );
    assert.equal(
      module.headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assert.equal(missing.status, 404);
    assert.equal(traversal.status, 404);
  } finally {
    await Deno.remove(outputDirectory, { recursive: true });
  }
});
