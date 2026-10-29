import {
  createReplSessionState,
  type ReplSessionOptions,
} from "./repl_session_state.ts";
import {
  type AsyncReplSession,
  createAsynchronousReplSession,
} from "./repl_session_controller.ts";
import { createBrowserReplSessionHost } from "./repl_host_browser.ts";

export type {
  AsyncReplSession,
  ReplResult,
} from "./repl_session_controller.ts";

export type BrowserReplSessionOptions =
  & Pick<
    ReplSessionOptions,
    "loadJavaScriptModule"
  >
  & {
    readonly onOutput?: (text: string) => void;
    readonly sources?: ReadonlyMap<string, string>;
  };

/**
 * Create a host-independent asynchronous REPL. Runtime evaluation uses
 * Function and eval, so browser hosts must allow unsafe-eval in their CSP.
 * Toss file and macro-library imports resolve only from the optional virtual
 * source map; no filesystem or network reads are performed.
 */
export function createBrowserReplSession(
  options: BrowserReplSessionOptions = {},
): AsyncReplSession {
  const host = createBrowserReplSessionHost(options.onOutput, options.sources);
  const state = createReplSessionState(options, host);
  return createAsynchronousReplSession(state);
}
