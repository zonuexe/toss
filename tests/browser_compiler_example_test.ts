import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { buildBrowserCompilerExample } from "../examples/browser-compiler/build.ts";
import {
  createBrowserCompilerHandler,
} from "../examples/browser-compiler/server.ts";
import { executeModuleProbe, text } from "./helpers.ts";

class FakeElement {
  textContent = "";
  type = "";
  disabled = false;
  htmlFor = "";
  rows = 0;
  spellcheck = true;
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, () => void | Promise<void>>();
  parent: FakeElement | undefined;
  focused = false;

  append(...elements: FakeElement[]): void {
    for (const element of elements) {
      element.parent = this;
      this.children.push(element);
    }
  }

  remove(): void {
    const index = this.parent?.children.indexOf(this) ?? -1;
    if (index !== -1) this.parent?.children.splice(index, 1);
  }

  addEventListener(name: string, listener: () => void | Promise<void>): void {
    this.listeners.set(name, listener);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  focus(): void {
    this.focused = true;
  }
}

type SelectedFile = {
  readonly name: string;
  text(): Promise<string>;
};

class FakeInput extends FakeElement {
  value = "";
  autocomplete = "";
  files: readonly SelectedFile[] = [];
}

class FakeLocalFile {
  reads = 0;

  constructor(
    readonly name: string,
    private readonly contents: string | Error,
  ) {}

  text(): Promise<string> {
    this.reads += 1;
    if (this.contents instanceof Error) return Promise.reject(this.contents);
    return Promise.resolve(this.contents);
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

class FakeAnchor extends FakeElement {
  href = "";
  download = "";
  clicked = false;

  click(): void {
    this.clicked = true;
  }
}

class FakeFieldset extends FakeElement {}

class FakeDocument {
  readonly createdTags: string[] = [];
  readonly elements = new Map<string, FakeElement>();
  readonly anchors: FakeAnchor[] = [];
  readonly body = new FakeElement();

  querySelector(selector: string): FakeElement | null {
    return this.elements.get(selector) ?? null;
  }

  createElement(tag: string): FakeElement {
    this.createdTags.push(tag);
    if (tag === "input") return new FakeInput();
    if (tag === "textarea") return new FakeTextArea();
    if (tag === "button") return new FakeButton();
    if (tag === "fieldset") return new FakeFieldset();
    if (tag === "a") {
      const anchor = new FakeAnchor();
      this.anchors.push(anchor);
      return anchor;
    }
    return new FakeElement();
  }
}

function sourceEditor(
  sourceFiles: FakeElement,
  index: number,
): {
  readonly legend: FakeElement;
  readonly path: FakeInput;
  readonly source: FakeTextArea;
  readonly remove: FakeButton;
} {
  const fieldset = sourceFiles.children[index];
  if (!(fieldset instanceof FakeFieldset)) {
    throw new Error(`Missing source file ${index}.`);
  }
  const legend = fieldset.children[0];
  const path = fieldset.children[2];
  const source = fieldset.children[4];
  const remove = fieldset.children[5];
  if (
    !(legend instanceof FakeElement) || !(path instanceof FakeInput) ||
    !(source instanceof FakeTextArea) ||
    !(remove instanceof FakeButton)
  ) {
    throw new Error(`Source file ${index} has missing controls.`);
  }
  return { legend, path, source, remove };
}

Deno.test("browser compiler edits virtual files and recovers from source errors", async () => {
  const outputDirectory = await Deno.makeTempDir({
    prefix: "toss-browser-compiler-",
  });
  const originalDocument = Reflect.get(globalThis, "document");
  const originalInput = Reflect.get(globalThis, "HTMLInputElement");
  const originalTextArea = Reflect.get(globalThis, "HTMLTextAreaElement");
  const originalButton = Reflect.get(globalThis, "HTMLButtonElement");
  const originalHtmlElement = Reflect.get(globalThis, "HTMLElement");
  const originalCreateObjectURL = Reflect.get(URL, "createObjectURL");
  const originalRevokeObjectURL = Reflect.get(URL, "revokeObjectURL");
  const originalSetTimeout = Reflect.get(globalThis, "setTimeout");
  const originalClearTimeout = Reflect.get(globalThis, "clearTimeout");
  const generatedBlobs: Blob[] = [];
  const revokedUrls: string[] = [];
  const scheduledTimers = new Map<number, () => void>();
  let nextUrl = 0;
  let nextTimer = 0;
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
      throw new Error("Missing compileSources export");
    }
    const generated = compiler(
      "main.toss",
      new Map([
        ["main.toss", "%export(%import('./math.toss'))."],
        ["math.toss", "%export(%import('./base.toss') add: 2)."],
        ["base.toss", "%export(40)."],
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

    const document = new FakeDocument();
    const entryPath = new FakeInput();
    entryPath.value = "main.toss";
    const localFiles = new FakeInput();
    const sourceFiles = new FakeElement();
    const addFile = new FakeButton();
    const compile = new FakeButton();
    const download = new FakeButton();
    const status = new FakeElement();
    const output = new FakeTextArea();
    document.elements.set("#entry-path", entryPath);
    document.elements.set("#local-files", localFiles);
    document.elements.set("#source-files", sourceFiles);
    document.elements.set("#add-file", addFile);
    document.elements.set("#compile", compile);
    document.elements.set("#download", download);
    document.elements.set("#status", status);
    document.elements.set("#output", output);
    assert.equal(Reflect.set(globalThis, "document", document), true);
    assert.equal(Reflect.set(globalThis, "HTMLInputElement", FakeInput), true);
    assert.equal(
      Reflect.set(globalThis, "HTMLTextAreaElement", FakeTextArea),
      true,
    );
    assert.equal(
      Reflect.set(globalThis, "HTMLButtonElement", FakeButton),
      true,
    );
    assert.equal(Reflect.set(globalThis, "HTMLElement", FakeElement), true);
    assert.equal(
      Reflect.set(URL, "createObjectURL", (blob: Blob) => {
        generatedBlobs.push(blob);
        nextUrl += 1;
        return `blob:test-${nextUrl}`;
      }),
      true,
    );
    assert.equal(
      Reflect.set(URL, "revokeObjectURL", (url: string) => {
        revokedUrls.push(url);
      }),
      true,
    );
    assert.equal(
      Reflect.set(globalThis, "setTimeout", (callback: () => void) => {
        nextTimer += 1;
        scheduledTimers.set(nextTimer, callback);
        return nextTimer;
      }),
      true,
    );
    assert.equal(
      Reflect.set(globalThis, "clearTimeout", (timer: number) => {
        scheduledTimers.delete(timer);
      }),
      true,
    );
    const appPath = `${outputDirectory}/app.js`;
    await import(`${pathToFileURL(appPath).href}?browser-test`);
    assert.equal(sourceFiles.children.length, 2);
    assert.equal(download.disabled, true);
    const main = sourceEditor(sourceFiles, 0);
    const math = sourceEditor(sourceFiles, 1);
    assert.equal(main.path.value, "main.toss");
    assert.equal(math.path.value, "math.toss");
    assert.equal(main.legend.textContent, "Source file 1: main.toss");
    assert.equal(math.legend.textContent, "Source file 2: math.toss");
    compile.click();
    assert.equal(status.textContent, "Compilation succeeded.");
    assert.match(output.value, /export default/);
    assert.equal(download.disabled, false);
    download.click();
    assert.equal(document.anchors[0]?.clicked, true);
    assert.equal(document.anchors[0]?.download, "main.mjs");
    assert.equal(document.anchors[0]?.href, "blob:test-1");
    assert.equal(generatedBlobs[0]?.type, "text/javascript;charset=utf-8");
    assert.equal(await generatedBlobs[0]?.text(), output.value);
    download.click();
    assert.deepEqual(revokedUrls, []);
    assert.equal(document.anchors[1]?.download, "main.mjs");
    assert.equal(await generatedBlobs[1]?.text(), output.value);
    assert.equal(scheduledTimers.size, 2);
    const revokeFirstDownload = scheduledTimers.get(1);
    assert.equal(typeof revokeFirstDownload, "function");
    revokeFirstDownload?.();
    assert.deepEqual(revokedUrls, ["blob:test-1"]);
    const revokeSecondDownload = scheduledTimers.get(2);
    assert.equal(typeof revokeSecondDownload, "function");
    revokeSecondDownload?.();
    assert.deepEqual(revokedUrls, ["blob:test-1", "blob:test-2"]);
    assert.equal(scheduledTimers.size, 0);

    addFile.click();
    assert.equal(output.value, "");
    assert.equal(download.disabled, true);
    assert.equal(status.textContent, "Sources changed. Compile again.");
    assert.equal(sourceFiles.children.length, 3);
    const base = sourceEditor(sourceFiles, 2);
    assert.equal(base.path.value, "new-file.toss");
    assert.equal(base.path.focused, true);
    assert.equal(
      base.remove.attributes.get("aria-label"),
      "Remove new-file.toss",
    );
    base.path.value = "base.toss";
    base.path.listeners.get("input")?.();
    assert.equal(base.legend.textContent, "Source file 3: base.toss");
    assert.equal(base.remove.attributes.get("aria-label"), "Remove base.toss");
    base.source.value = "%export(40).";
    base.source.listeners.get("input")?.();
    math.source.value = "%export(%import('./base.toss') add: 2).";
    math.source.listeners.get("input")?.();
    compile.click();
    assert.equal(status.textContent, "Compilation succeeded.");
    assert.match(output.value, /base\.toss/);
    assert.equal(download.disabled, false);

    base.path.value = "math.toss";
    base.path.listeners.get("input")?.();
    assert.equal(base.legend.textContent, "Source file 3: math.toss");
    assert.notEqual(base.legend.textContent, math.legend.textContent);
    compile.click();
    assert.match(status.textContent, /Duplicate source path/);
    assert.equal(output.value, "");
    assert.equal(download.disabled, true);
    base.path.value = "./folder/../math.toss";
    base.path.listeners.get("input")?.();
    compile.click();
    assert.match(status.textContent, /Duplicate source map path/);
    assert.equal(output.value, "");
    assert.equal(download.disabled, true);

    base.path.value = "folder/../new-file.toss";
    base.path.listeners.get("input")?.();
    addFile.click();
    const collisionSafe = sourceEditor(sourceFiles, 3);
    assert.equal(collisionSafe.path.value, "new-file-2.toss");
    collisionSafe.remove.click();
    base.path.value = "../outside.toss";
    base.path.listeners.get("input")?.();
    addFile.click();
    const addedWhilePathInvalid = sourceEditor(sourceFiles, 3);
    assert.equal(addedWhilePathInvalid.path.value, "new-file.toss");
    addedWhilePathInvalid.remove.click();

    base.path.value = "base.toss";
    base.path.listeners.get("input")?.();
    base.path.value = "";
    base.path.listeners.get("input")?.();
    assert.equal(base.legend.textContent, "Source file 3: (unnamed)");
    base.path.value = "base.toss";
    base.path.listeners.get("input")?.();
    entryPath.value = "missing.toss";
    entryPath.listeners.get("input")?.();
    compile.click();
    assert.match(status.textContent, /Entry source is not present/);
    assert.equal(download.disabled, true);
    entryPath.value = "main.toss";
    base.path.value = "</label><script>.toss";
    base.path.listeners.get("input")?.();
    assert.equal(
      base.legend.textContent,
      "Source file 3: </label><script>.toss",
    );
    base.source.value = '%export(%js("</textarea><script>")).';
    base.source.listeners.get("input")?.();
    main.source.value = "%export(%import('./</label><script>.toss')).";
    main.source.listeners.get("input")?.();
    compile.click();
    assert.equal(status.textContent, "Compilation succeeded.");
    assert.equal(download.disabled, false);
    assert.match(output.value, /<script>/);
    assert.ok(!document.createdTags.includes("script"));
    download.click();
    assert.equal(document.anchors.at(-1)?.download, "main.mjs");
    assert.equal(await generatedBlobs.at(-1)?.text(), output.value);

    base.remove.click();
    assert.equal(math.path.focused, true);
    assert.equal(output.value, "");
    assert.equal(download.disabled, true);
    assert.equal(revokedUrls.at(-1), "blob:test-3");
    assert.equal(sourceFiles.children.length, 2);
    main.remove.click();
    assert.equal(sourceFiles.children.length, 1);
    assert.equal(math.path.focused, true);
    compile.click();
    assert.match(status.textContent, /Entry source is not present/);
    assert.equal(output.value, "");
    assert.equal(download.disabled, true);
    addFile.click();
    const replacementEntry = sourceEditor(sourceFiles, 1);
    replacementEntry.path.value = "main.toss";
    replacementEntry.path.listeners.get("input")?.();
    replacementEntry.source.value = "%export(%import('../escape.toss')).";
    replacementEntry.source.listeners.get("input")?.();
    compile.click();
    assert.match(status.textContent, /escapes the source map root/);
    assert.equal(download.disabled, true);
    replacementEntry.source.value = "%export(7).";
    replacementEntry.source.listeners.get("input")?.();
    compile.click();
    assert.equal(status.textContent, "Compilation succeeded.");
    assert.equal(download.disabled, false);
    entryPath.value = "folder/../main.toss";
    entryPath.listeners.get("input")?.();
    assert.equal(download.disabled, true);
    compile.click();
    assert.equal(download.disabled, false);
    download.click();
    assert.equal(document.anchors.at(-1)?.download, "main.mjs");
    assert.equal(await generatedBlobs.at(-1)?.text(), output.value);
    math.source.listeners.get("input")?.();
    assert.equal(download.disabled, true);
    assert.equal(revokedUrls.at(-1), "blob:test-4");

    compile.click();
    assert.equal(download.disabled, false);
    const compiledBeforeSelection = output.value;
    const initialSourceCount = sourceFiles.children.length;
    await localFiles.listeners.get("change")?.();
    assert.equal(localFiles.value, "");
    assert.equal(output.value, compiledBeforeSelection);
    assert.equal(sourceFiles.children.length, initialSourceCount);
    assert.match(status.textContent, /canceled/);

    math.path.value = "./folder/../math.toss";
    math.path.listeners.get("input")?.();
    compile.click();
    assert.equal(status.textContent, "Compilation succeeded.");
    const compiledWithAlias = output.value;
    const duplicateFile = new FakeLocalFile("math.toss", "%export(5). ");
    localFiles.files = [duplicateFile];
    await localFiles.listeners.get("change")?.();
    assert.equal(sourceFiles.children.length, initialSourceCount);
    assert.equal(output.value, compiledWithAlias);
    assert.equal(duplicateFile.reads, 0);
    assert.match(status.textContent, /Duplicate virtual source path/);
    math.path.value = "math.toss";
    math.path.listeners.get("input")?.();
    compile.click();
    assert.equal(status.textContent, "Compilation succeeded.");

    const repeatedNameFirst = new FakeLocalFile("same.toss", "%export(1).");
    const repeatedNameSecond = new FakeLocalFile("same.toss", "%export(2).");
    localFiles.files = [repeatedNameFirst, repeatedNameSecond];
    await localFiles.listeners.get("change")?.();
    assert.equal(repeatedNameFirst.reads, 0);
    assert.equal(repeatedNameSecond.reads, 0);
    assert.equal(sourceFiles.children.length, initialSourceCount);
    assert.equal(output.value, compiledBeforeSelection);
    assert.match(status.textContent, /Duplicate virtual source path/);

    const invalidFile = new FakeLocalFile("notes.txt", "%export(5). ");
    localFiles.files = [invalidFile];
    await localFiles.listeners.get("change")?.();
    assert.equal(sourceFiles.children.length, initialSourceCount);
    assert.equal(output.value, compiledBeforeSelection);
    assert.match(status.textContent, /\.toss extension/);

    const lineBreakFile = new FakeLocalFile("bad\nname.toss", "%export(5). ");
    localFiles.files = [lineBreakFile];
    await localFiles.listeners.get("change")?.();
    assert.equal(lineBreakFile.reads, 0);
    assert.equal(output.value, compiledBeforeSelection);
    assert.match(status.textContent, /line breaks/);

    const pathFile = new FakeLocalFile("folder/extra.toss", "%export(5). ");
    localFiles.files = [pathFile];
    await localFiles.listeners.get("change")?.();
    assert.equal(pathFile.reads, 0);
    assert.equal(output.value, compiledBeforeSelection);
    assert.match(status.textContent, /single file name/);

    localFiles.files = [
      new FakeLocalFile("first.toss", "%export(5)."),
      new FakeLocalFile("second.toss", new Error("read denied")),
    ];
    await localFiles.listeners.get("change")?.();
    assert.equal(sourceFiles.children.length, initialSourceCount);
    assert.equal(output.value, compiledBeforeSelection);
    assert.equal(download.disabled, false);
    assert.match(status.textContent, /read denied/);
    assert.equal(localFiles.value, "");

    localFiles.files = [
      new FakeLocalFile("first.toss", "%export(5)."),
      new FakeLocalFile("second.toss", "%export(6)."),
    ];
    await localFiles.listeners.get("change")?.();
    assert.equal(sourceFiles.children.length, initialSourceCount + 2);
    assert.equal(output.value, "");
    assert.equal(download.disabled, true);
    assert.equal(
      sourceEditor(sourceFiles, initialSourceCount).path.focused,
      true,
    );
    assert.equal(
      sourceEditor(sourceFiles, initialSourceCount).path.value,
      "first.toss",
    );
    assert.match(status.textContent, /Added 2 Toss file/);

    compile.click();
    const outputBeforeStaleRead = output.value;
    let finishRead: ((value: string) => void) | undefined;
    localFiles.files = [{
      name: "late.toss",
      text: () => new Promise<string>((resolve) => finishRead = resolve),
    }];
    const staleSelection = localFiles.listeners.get("change")?.();
    assert.equal(typeof finishRead, "function");
    entryPath.value = "folder/../main.toss";
    entryPath.listeners.get("input")?.();
    compile.click();
    const freshOutput = output.value;
    assert.notEqual(freshOutput, "");
    finishRead?.("%export(99).");
    await staleSelection;
    assert.equal(output.value, freshOutput);
    assert.equal(output.value, outputBeforeStaleRead);
    assert.equal(sourceFiles.children.length, initialSourceCount + 2);
    assert.equal(download.disabled, false);

    let finishCanceledRead: ((value: string) => void) | undefined;
    localFiles.files = [{
      name: "canceled-late.toss",
      text: () =>
        new Promise<string>((resolve) => finishCanceledRead = resolve),
    }];
    const canceledRead = localFiles.listeners.get("change")?.();
    assert.equal(typeof finishCanceledRead, "function");
    localFiles.files = [];
    await localFiles.listeners.get("change")?.();
    const outputAfterCancel = output.value;
    const statusAfterCancel = status.textContent;
    finishCanceledRead?.("%export(100).");
    await canceledRead;
    assert.equal(output.value, outputAfterCancel);
    assert.equal(status.textContent, statusAfterCancel);
    assert.equal(sourceFiles.children.length, initialSourceCount + 2);

    let finishNativeCanceledRead: ((value: string) => void) | undefined;
    localFiles.files = [{
      name: "native-canceled-late.toss",
      text: () =>
        new Promise<string>((resolve) => finishNativeCanceledRead = resolve),
    }];
    const nativeCanceledRead = localFiles.listeners.get("change")?.();
    assert.equal(typeof finishNativeCanceledRead, "function");
    await localFiles.listeners.get("cancel")?.();
    const statusAfterNativeCancel = status.textContent;
    finishNativeCanceledRead?.("%export(101).");
    await nativeCanceledRead;
    assert.equal(status.textContent, statusAfterNativeCancel);
    assert.equal(output.value, outputAfterCancel);
    assert.equal(sourceFiles.children.length, initialSourceCount + 2);
  } finally {
    await Deno.remove(outputDirectory, { recursive: true });
    if (originalDocument === undefined) {
      Reflect.deleteProperty(globalThis, "document");
    } else Reflect.set(globalThis, "document", originalDocument);
    if (originalInput === undefined) {
      Reflect.deleteProperty(globalThis, "HTMLInputElement");
    } else Reflect.set(globalThis, "HTMLInputElement", originalInput);
    if (originalTextArea === undefined) {
      Reflect.deleteProperty(globalThis, "HTMLTextAreaElement");
    } else Reflect.set(globalThis, "HTMLTextAreaElement", originalTextArea);
    if (originalButton === undefined) {
      Reflect.deleteProperty(globalThis, "HTMLButtonElement");
    } else Reflect.set(globalThis, "HTMLButtonElement", originalButton);
    if (originalHtmlElement === undefined) {
      Reflect.deleteProperty(globalThis, "HTMLElement");
    } else Reflect.set(globalThis, "HTMLElement", originalHtmlElement);
    Reflect.set(URL, "createObjectURL", originalCreateObjectURL);
    Reflect.set(URL, "revokeObjectURL", originalRevokeObjectURL);
    Reflect.set(globalThis, "setTimeout", originalSetTimeout);
    Reflect.set(globalThis, "clearTimeout", originalClearTimeout);
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
    const localSources = await handle(
      new Request("http://localhost/local_sources.js"),
    );
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
    assert.equal(
      localSources.headers.get("content-type"),
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
