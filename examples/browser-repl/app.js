import {
  bindWorkerPageLifecycle,
  createWorkerClient,
} from "./worker-client.js";
import {
  validateVirtualSourceEntries,
  virtualSourceEditorLegend,
} from "./source-list.js";

const form = document.querySelector("#cell-form");
const source = document.querySelector("#cell-source");
const submitButton = document.querySelector("#submit");
const resetButton = document.querySelector("#reset");
const reloadButton = document.querySelector("#reload");
const status = document.querySelector("#status");
const transcript = document.querySelector("#transcript");
const clearTranscriptButton = document.querySelector("#clear-transcript");
const demoImportExample = document.querySelector("#demo-import-example");
const virtualSources = document.querySelector("#virtual-sources");
const addSourceButton = document.querySelector("#add-source");

if (
  !(form instanceof HTMLFormElement) ||
  !(source instanceof HTMLTextAreaElement) ||
  !(submitButton instanceof HTMLButtonElement) ||
  !(resetButton instanceof HTMLButtonElement) ||
  !(reloadButton instanceof HTMLButtonElement) ||
  !(status instanceof HTMLElement) ||
  !(transcript instanceof HTMLOListElement) ||
  !(clearTranscriptButton instanceof HTMLButtonElement) ||
  !(demoImportExample instanceof HTMLElement) ||
  !(virtualSources instanceof HTMLElement) ||
  !(addSourceButton instanceof HTMLButtonElement)
) {
  throw new Error("The browser REPL page is missing a required control.");
}

demoImportExample.textContent =
  `%jsImport('${window.location.origin}/demo-module.js')`;

const maximumTranscriptEntries = 200;
let workerReady = false;
let pending = false;
let sourcesValid = true;
let nextSourceNumber = 1;

function sourceEntries() {
  return [...virtualSources.querySelectorAll("fieldset")].map((fieldset) => {
    const path = fieldset.querySelector("input");
    const content = fieldset.querySelector("textarea");
    if (
      !(path instanceof HTMLInputElement) ||
      !(content instanceof HTMLTextAreaElement)
    ) {
      throw new Error("A virtual source editor is missing a field.");
    }
    return [path.value, content.value];
  });
}

function updateSources() {
  const entries = sourceEntries();
  const validation = validateVirtualSourceEntries(entries);
  sourcesValid = validation.ok;
  updateControls();
  if (!validation.ok) {
    status.textContent =
      `Virtual sources need attention: ${validation.message}`;
    return;
  }
  if (workerReady && !client.updateSources(entries)) return;
  if (!pending) {
    status.textContent =
      "Source edits are in the Worker. Reset session to refresh imported Toss files.";
  }
}

function createSourceEditor(pathValue, sourceValue) {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const pathLabel = document.createElement("label");
  const path = document.createElement("input");
  const sourceLabel = document.createElement("label");
  const content = document.createElement("textarea");
  const remove = document.createElement("button");
  const editorNumber = nextSourceNumber++;
  const editorId = `virtual-source-${editorNumber}`;
  legend.textContent = virtualSourceEditorLegend(editorNumber, pathValue);
  pathLabel.htmlFor = `${editorId}-path`;
  pathLabel.textContent = "Virtual path";
  path.id = `${editorId}-path`;
  path.type = "text";
  path.value = pathValue;
  path.autocomplete = "off";
  sourceLabel.htmlFor = `${editorId}-content`;
  sourceLabel.textContent = "Toss source text";
  content.id = `${editorId}-content`;
  content.rows = 5;
  content.spellcheck = false;
  content.value = sourceValue;
  remove.type = "button";
  remove.textContent = "Remove source";
  remove.setAttribute("aria-label", `Remove ${pathValue || "unnamed"}`);
  path.addEventListener("input", () => {
    legend.textContent = virtualSourceEditorLegend(editorNumber, path.value);
    remove.setAttribute("aria-label", `Remove ${path.value || "unnamed"}`);
    updateSources();
  });
  content.addEventListener("input", updateSources);
  remove.addEventListener("click", () => {
    fieldset.remove();
    updateSources();
    const next = virtualSources.querySelector("input");
    if (next instanceof HTMLInputElement) next.focus();
    else addSourceButton.focus();
  });
  fieldset.append(legend, pathLabel, path, sourceLabel, content, remove);
  virtualSources.append(fieldset);
  return path;
}

createSourceEditor("math.toss", "%export(40 add: 2).");
createSourceEditor("macros.toss", "%macro(#answer, { s -> %quote(42) }).");

function updateControls() {
  const canOperate = workerReady && !pending && sourcesValid;
  submitButton.disabled = !canOperate;
  resetButton.disabled = !canOperate;
  reloadButton.disabled = false;
  addSourceButton.disabled = !workerReady || pending;
}

function addEntry(label, text) {
  const item = document.createElement("li");
  const heading = document.createElement("strong");
  const value = document.createElement("span");
  heading.textContent = `${label}: `;
  value.textContent = text;
  item.append(heading, value);
  transcript.append(item);
  while (transcript.children.length > maximumTranscriptEntries) {
    transcript.firstElementChild?.remove();
  }
}

const client = createWorkerClient(
  () => new Worker("/worker.js", { type: "module" }),
  {
    onReady(ready) {
      workerReady = ready;
      if (ready) updateSources();
      updateControls();
      if (ready && workerReady && sourcesValid) {
        status.textContent = "Worker ready.";
      } else if (!ready && !pending && sourcesValid) {
        status.textContent = "Starting Worker…";
      }
    },
    onPending(value, operation) {
      pending = value;
      updateControls();
      if (value) {
        status.textContent = operation === "reset"
          ? "Resetting session…"
          : "Evaluating cell…";
      }
    },
    onOutput(text) {
      addEntry("Output", text);
    },
    onComplete(operation, result) {
      if (operation === "reset") {
        status.textContent =
          "Session reset. JavaScript module cache remains loaded.";
        addEntry(
          "Session",
          "Toss state reset; JavaScript modules remain loaded.",
        );
        return;
      }
      if (typeof result !== "object" || result === null) {
        status.textContent = "Worker returned an invalid cell result.";
        addEntry("Error", status.textContent);
        return;
      }
      switch (result.kind) {
        case "empty":
          status.textContent = "Cell completed without a value.";
          break;
        case "value":
          addEntry("Result", `=> ${result.display}`);
          status.textContent = "Cell complete.";
          break;
        case "error":
          addEntry("Error", result.message);
          status.textContent =
            "Cell failed; the session is ready for another cell.";
          break;
        default:
          status.textContent = "Worker returned an unknown cell result.";
          addEntry("Error", status.textContent);
      }
    },
    onWorkerError(message) {
      workerReady = false;
      updateControls();
      status.textContent = `Worker failed: ${message}`;
      addEntry("Worker error", message);
    },
  },
);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const submittedSource = source.value;
  if (!client.submit(submittedSource)) return;
  addEntry("Cell", submittedSource);
  source.value = "";
  source.focus();
});

clearTranscriptButton.addEventListener("click", () => {
  transcript.replaceChildren();
});

addSourceButton.addEventListener("click", () => {
  let path = `source-${nextSourceNumber}.toss`;
  while (sourceEntries().some(([existing]) => existing === path)) {
    path = `source-${nextSourceNumber}.toss`;
    nextSourceNumber += 1;
  }
  const pathInput = createSourceEditor(path, "");
  pathInput.focus();
  updateSources();
});

resetButton.addEventListener("click", () => {
  client.reset(sourceEntries());
});

reloadButton.addEventListener("click", () => {
  client.reload();
  addEntry(
    "Session",
    "Worker replaced; Toss state and JavaScript module cache reset.",
  );
  status.textContent = "Starting a fresh Worker…";
});

bindWorkerPageLifecycle(client, window, () => {
  status.textContent = "Page restored. Starting a fresh REPL session…";
  addEntry(
    "Session",
    "Page restoration started a fresh Worker; Toss state and JavaScript module cache were reset.",
  );
});
