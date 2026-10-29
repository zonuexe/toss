import { compileSources } from "./compiler.js";
import {
  nextAvailableVirtualSourcePath,
  readLocalSources,
} from "./local_sources.js";

const entryInput = document.querySelector("#entry-path");
const localFilesInput = document.querySelector("#local-files");
const sourceFiles = document.querySelector("#source-files");
const addFileButton = document.querySelector("#add-file");
const compileButton = document.querySelector("#compile");
const downloadButton = document.querySelector("#download");
const status = document.querySelector("#status");
const output = document.querySelector("#output");

if (
  !(entryInput instanceof HTMLInputElement) ||
  !(localFilesInput instanceof HTMLInputElement) ||
  !(sourceFiles instanceof HTMLElement) ||
  !(addFileButton instanceof HTMLButtonElement) ||
  !(compileButton instanceof HTMLButtonElement) ||
  !(downloadButton instanceof HTMLButtonElement) ||
  !(status instanceof HTMLElement) ||
  !(output instanceof HTMLTextAreaElement)
) {
  throw new Error("The compiler page is missing a required control.");
}

let fileNumber = 0;
let sourceRevision = 0;
let selectionVersion = 0;
const files = [];
const activeDownloadUrls = new Set();
const revokeTimers = new Map();
downloadButton.disabled = true;

function revokeDownloadUrl(objectUrl) {
  const timer = revokeTimers.get(objectUrl);
  if (timer !== undefined) {
    clearTimeout(timer);
    revokeTimers.delete(objectUrl);
  }
  if (!activeDownloadUrls.delete(objectUrl)) return;
  URL.revokeObjectURL(objectUrl);
}

function revokeActiveDownloads() {
  for (const objectUrl of activeDownloadUrls) revokeDownloadUrl(objectUrl);
}

function disableDownload() {
  downloadButton.disabled = true;
  revokeActiveDownloads();
}

function markSourcesChanged() {
  sourceRevision += 1;
  selectionVersion += 1;
  output.value = "";
  disableDownload();
  status.textContent = "Sources changed. Compile again.";
}

localFilesInput.addEventListener("change", async () => {
  const selected = Array.from(localFilesInput.files ?? []);
  localFilesInput.value = "";
  const version = ++selectionVersion;
  if (selected.length === 0) {
    status.textContent = "File selection canceled; sources are unchanged.";
    return;
  }

  const revision = sourceRevision;
  try {
    status.textContent = `Reading ${selected.length} Toss file(s)…`;
    const readFiles = await readLocalSources(selected, files);
    if (version !== selectionVersion || revision !== sourceRevision) return;

    const addedFiles = readFiles.map((selectedFile) =>
      createSourceFile(selectedFile.name, selectedFile.source)
    );
    sourceRevision += 1;
    selectionVersion += 1;
    output.value = "";
    disableDownload();
    status.textContent =
      `Added ${addedFiles.length} Toss file(s). Compile again.`;
    addedFiles[0]?.pathInput.focus();
  } catch (error) {
    if (version !== selectionVersion || revision !== sourceRevision) return;
    status.textContent = error instanceof Error
      ? `Could not add selected files: ${error.message}`
      : "Could not read the selected Toss files.";
  }
});

localFilesInput.addEventListener("cancel", () => {
  selectionVersion += 1;
  localFilesInput.value = "";
  status.textContent = "File selection canceled; sources are unchanged.";
});

function downloadFilename(entryPath) {
  const parts = [];
  for (const part of entryPath.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  const basename = parts.at(-1) ?? "";
  const stem = basename.endsWith(".toss")
    ? basename.slice(0, -".toss".length)
    : basename;
  const safeStem = stem.replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 80) || "output";
  return `${safeStem}.mjs`;
}

function createSourceFile(path, source) {
  fileNumber += 1;
  const sourceNumber = fileNumber;
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const pathId = `source-path-${fileNumber}`;
  const sourceId = `source-text-${fileNumber}`;
  const pathLabel = document.createElement("label");
  const pathInput = document.createElement("input");
  const sourceLabel = document.createElement("label");
  const sourceInput = document.createElement("textarea");
  const removeButton = document.createElement("button");

  pathLabel.htmlFor = pathId;
  pathLabel.textContent = "Virtual path";
  pathInput.id = pathId;
  pathInput.type = "text";
  pathInput.autocomplete = "off";
  pathInput.value = path;
  legend.textContent = sourceLegend(sourceNumber, pathInput.value);
  sourceLabel.htmlFor = sourceId;
  sourceLabel.textContent = "Toss source";
  sourceInput.id = sourceId;
  sourceInput.rows = 8;
  sourceInput.spellcheck = false;
  sourceInput.value = source;
  removeButton.type = "button";
  removeButton.textContent = "Remove source file";
  removeButton.setAttribute(
    "aria-label",
    `Remove ${pathInput.value || "source file"}`,
  );
  pathInput.addEventListener("input", () => {
    removeButton.setAttribute(
      "aria-label",
      `Remove ${pathInput.value || "source file"}`,
    );
    legend.textContent = sourceLegend(sourceNumber, pathInput.value);
    markSourcesChanged();
  });
  sourceInput.addEventListener("input", markSourcesChanged);
  removeButton.addEventListener("click", () => {
    const index = files.findIndex((file) => file.fieldset === fieldset);
    const nextFocus = files[index + 1]?.pathInput ??
      files[index - 1]?.pathInput ?? addFileButton;
    fieldset.remove();
    if (index !== -1) files.splice(index, 1);
    markSourcesChanged();
    nextFocus.focus();
  });

  fieldset.append(
    legend,
    pathLabel,
    pathInput,
    sourceLabel,
    sourceInput,
    removeButton,
  );
  sourceFiles.append(fieldset);
  const file = { fieldset, pathInput, sourceInput };
  files.push(file);
  return file;
}

function sourceLegend(sourceNumber, path) {
  return `Source file ${sourceNumber}: ${path || "(unnamed)"}`;
}

function nextSourcePath() {
  return nextAvailableVirtualSourcePath(
    files.map((file) => file.pathInput.value),
  );
}

createSourceFile("main.toss", "%export(%import('./math.toss')).");
createSourceFile("math.toss", "%export(40 add: 2).");

addFileButton.addEventListener("click", () => {
  const file = createSourceFile(nextSourcePath(), "");
  markSourcesChanged();
  file.pathInput.focus();
});

entryInput.addEventListener("input", markSourcesChanged);

downloadButton.addEventListener("click", () => {
  if (downloadButton.disabled || output.value.length === 0) return;
  const blob = new Blob([output.value], {
    type: "text/javascript;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  activeDownloadUrls.add(objectUrl);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = downloadFilename(entryInput.value);
  anchor.setAttribute("hidden", "");
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  const timer = setTimeout(() => revokeDownloadUrl(objectUrl), 1000);
  revokeTimers.set(objectUrl, timer);
});

compileButton.addEventListener("click", () => {
  selectionVersion += 1;
  output.value = "";
  disableDownload();
  status.textContent = "Compiling…";
  try {
    const sources = new Map();
    const seenPaths = new Set();
    for (const file of files) {
      const path = file.pathInput.value;
      if (seenPaths.has(path)) {
        throw new Error(
          `Duplicate source path ${
            JSON.stringify(path)
          }. Rename one file before compiling.`,
        );
      }
      seenPaths.add(path);
      sources.set(path, file.sourceInput.value);
    }
    output.value = compileSources(entryInput.value, sources, { format: "esm" });
    downloadButton.disabled = false;
    status.textContent = "Compilation succeeded.";
  } catch (error) {
    status.textContent = error instanceof Error
      ? error.message
      : "Compilation failed.";
  }
});
