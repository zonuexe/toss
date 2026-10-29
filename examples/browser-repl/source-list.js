export function validateVirtualSourceEntries(entries) {
  const seen = new Set();
  for (const [path] of entries) {
    let normalized;
    try {
      normalized = normalizeSourceId(path);
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    if (seen.has(normalized)) {
      return {
        ok: false,
        message: `More than one editor uses the virtual path ${normalized}.`,
      };
    }
    seen.add(normalized);
  }
  return { ok: true };
}

function normalizeSourceId(path) {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\")) {
    throw new TypeError("Virtual paths must be root-relative POSIX paths.");
  }
  const parts = [];
  for (const part of path.split("/")) {
    if (part.length === 0 || part === ".") continue;
    if (part === "..") {
      if (parts.pop() === undefined) {
        throw new TypeError("Virtual path escapes the source root.");
      }
      continue;
    }
    parts.push(part);
  }
  const normalized = parts.join("/");
  if (normalized.length === 0 || !normalized.endsWith(".toss")) {
    throw new TypeError("Virtual paths must name .toss files.");
  }
  return normalized;
}
