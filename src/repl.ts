import {
  createReplSessionState,
  type ReplSessionOptions,
} from "./repl_session_state.ts";
import {
  type AsyncReplSession,
  createAsynchronousReplSession,
  createSynchronousReplSession,
  type ReplSession,
} from "./repl_session_controller.ts";
import { createDenoReplSessionHost } from "./repl_host_deno.ts";

export type { ReplResult, ReplSessionOptions } from "./repl_session_state.ts";
export type {
  AsyncReplSession,
  ReplSession,
} from "./repl_session_controller.ts";

export function createReplSession(
  options: ReplSessionOptions = {},
): ReplSession {
  const host = createDenoReplSessionHost(options.baseDirectory ?? Deno.cwd());
  return createSynchronousReplSession(createReplSessionState(options, host));
}

export function createAsyncReplSession(
  options: ReplSessionOptions = {},
): AsyncReplSession {
  const host = createDenoReplSessionHost(options.baseDirectory ?? Deno.cwd());
  return createAsynchronousReplSession(
    createReplSessionState(options, host),
  );
}
