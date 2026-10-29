class InvalidVirtualSourcePath extends Error {}

function normalizeSourceId(path) {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\")) {
    throw new InvalidVirtualSourcePath(
      `Invalid virtual source path ${JSON.stringify(path)}.`,
    );
  }
  const parts = [];
  for (const part of path.split("/")) {
    if (part.length === 0 || part === ".") continue;
    if (part === "..") {
      if (parts.pop() === undefined) {
        throw new InvalidVirtualSourcePath(
          `Virtual source path ${
            JSON.stringify(path)
          } escapes the source root.`,
        );
      }
      continue;
    }
    parts.push(part);
  }
  const id = parts.join("/");
  if (id.length === 0 || !id.endsWith(".toss")) {
    throw new InvalidVirtualSourcePath(
      "Selected files must use the .toss extension.",
    );
  }
  return id;
}

export function nextAvailableVirtualSourcePath(existingPaths) {
  const existingIds = new Set();
  for (const path of existingPaths) {
    try {
      existingIds.add(normalizeSourceId(path));
    } catch (error) {
      if (!(error instanceof InvalidVirtualSourcePath)) throw error;
    }
  }

  let candidate = "new-file.toss";
  let suffix = 2;
  while (existingIds.has(normalizeSourceId(candidate))) {
    candidate = `new-file-${suffix}.toss`;
    suffix += 1;
  }
  return candidate;
}

export async function readLocalSources(selected, existingFiles) {
  const existingIds = new Set(
    existingFiles.map((file) => normalizeSourceId(file.pathInput.value)),
  );
  const selectedIds = new Set();
  for (const selectedFile of selected) {
    if (selectedFile.name.includes("/") || selectedFile.name.includes("\\")) {
      throw new InvalidVirtualSourcePath(
        `Selected file name ${
          JSON.stringify(selectedFile.name)
        } is not a single file name.`,
      );
    }
    if (selectedFile.name.includes("\r") || selectedFile.name.includes("\n")) {
      throw new InvalidVirtualSourcePath(
        "Selected file names cannot contain line breaks.",
      );
    }
    const id = normalizeSourceId(selectedFile.name);
    if (existingIds.has(id) || selectedIds.has(id)) {
      throw new InvalidVirtualSourcePath(
        `Duplicate virtual source path ${
          JSON.stringify(id)
        }. Rename or remove the existing source before selecting files.`,
      );
    }
    selectedIds.add(id);
  }
  const contents = await Promise.all(
    selected.map((selectedFile) => selectedFile.text()),
  );
  return selected.map((selectedFile, index) => ({
    name: selectedFile.name,
    source: contents[index] ?? "",
  }));
}
