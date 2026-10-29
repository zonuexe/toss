import type { SourceLocation } from "./diagnostic.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { normalizeVirtualSourceId } from "./module_graph.ts";
import type { ReplSessionHost, ReplSourceSnapshot } from "./repl_host.ts";
import {
  compileBrowserReplModules,
  createBrowserMacroImportState,
} from "./repl_modules_browser.ts";

const browserBase = "<browser-repl>";

export function createBrowserReplSessionHost(
  writeOutput?: (text: string) => void,
  sources?: ReadonlyMap<string, string>,
): ReplSessionHost {
  return Object.freeze({
    baseDirectory: browserBase,
    ...(writeOutput === undefined ? {} : { writeOutput }),
    createMacroImportState: createBrowserMacroImportState,
    createSourceSnapshot: () => createBrowserSourceSnapshot(sources),
    createModuleState: () => ({ files: new Map(), nextId: 0 }),
    compileModules: compileBrowserReplModules,
  });
}

function createBrowserSourceSnapshot(
  sources: ReadonlyMap<string, string> | undefined,
): ReplSourceSnapshot {
  let normalized: ReadonlyMap<string, string> | undefined;
  return Object.freeze({
    hasSources: sources !== undefined,
    getSources(location: SourceLocation, kind: "module" | "macro") {
      if (sources === undefined) {
        const directive = kind === "module" ? "%import" : "%macroImport";
        throw new TossSyntaxError(
          location,
          `${directive} is unavailable in the browser REPL core.`,
        );
      }
      if (normalized !== undefined) return normalized;
      const canonical = new Map<string, string>();
      try {
        for (const [path, source] of sources) {
          const id = normalizeVirtualSourceId(path);
          if (canonical.has(id)) {
            throw new TypeError(
              `Duplicate source map path: ${JSON.stringify(id)}.`,
            );
          }
          canonical.set(id, source);
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new TossSyntaxError(
          location,
          `Invalid browser source map: ${detail}`,
        );
      }
      normalized = canonical;
      return normalized;
    },
  });
}
