import { createBrowserReplSession } from "./repl-core.js";
import { validateVirtualSourceEntries } from "./source-list.js";

const sources = new Map([
  ["math.toss", "%export(40 add: 2)."],
  ["macros.toss", "%macro(#answer, { s -> %quote(42) })."],
]);
const session = createBrowserReplSession({
  sources,
  onOutput: (text) => self.postMessage({ type: "output", text }),
});
let queue = Promise.resolve();

self.addEventListener("message", (event) => {
  queue = queue.then(() => processMessage(event.data)).catch((error) => {
    self.postMessage({
      type: "fatal",
      message: error instanceof Error ? error.message : String(error),
    });
  });
});

self.postMessage({ type: "ready" });

async function processMessage(message) {
  if (typeof message !== "object" || message === null) return;
  if (message.type === "sources") {
    replaceSources(message.sources);
    return;
  }
  if (!Number.isSafeInteger(message.requestId)) return;
  if (message.type === "submit" && typeof message.source === "string") {
    const result = await session.submit(message.source);
    self.postMessage({
      type: "complete",
      requestId: message.requestId,
      result,
    });
    return;
  }
  if (message.type === "reset") {
    replaceSources(message.sources);
    await session.reset();
    self.postMessage({ type: "complete", requestId: message.requestId });
  }
}

function replaceSources(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError(
      "Worker source update must be a list of path and text pairs.",
    );
  }
  const validation = validateVirtualSourceEntries(entries);
  if (!validation.ok) {
    throw new TypeError(
      `Worker source update is invalid: ${validation.message}`,
    );
  }
  const replacement = new Map();
  for (const entry of entries) {
    if (
      !Array.isArray(entry) || entry.length !== 2 ||
      typeof entry[0] !== "string" || typeof entry[1] !== "string"
    ) {
      throw new TypeError("Worker source update contains an invalid source.");
    }
    replacement.set(entry[0], entry[1]);
  }
  sources.clear();
  for (const [path, source] of replacement) sources.set(path, source);
}
