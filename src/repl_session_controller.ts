import { TossSyntaxError } from "./diagnostic.ts";
import type { ReplResult, ReplSessionState } from "./repl_session_state.ts";

export type ReplSession = {
  readonly submit: (source: string) => ReplResult;
  readonly reset: () => void;
};

export type AsyncReplSession = {
  readonly submit: (source: string) => Promise<ReplResult>;
  readonly reset: () => Promise<void>;
};

export function createSynchronousReplSession(
  state: ReplSessionState,
): ReplSession {
  const submit = (source: string): ReplResult => {
    const candidate = state.prepare(source);
    if (candidate.kind === "error") return candidate;
    const first = candidate.moduleCandidate.javascriptImports[0];
    if (first !== undefined) {
      return {
        kind: "error",
        message: new TossSyntaxError(
          first.location,
          "%jsImport requires createAsyncReplSession.",
        ).message,
      };
    }
    state.commit(candidate, []);
    return state.evaluate(candidate);
  };
  return Object.freeze({ submit, reset: state.reset });
}

export function createAsynchronousReplSession(
  state: ReplSessionState,
): AsyncReplSession {
  let queue = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  const submit = (source: string): Promise<ReplResult> =>
    enqueue(async () => {
      const candidate = state.prepare(source);
      if (candidate.kind === "error") return candidate;
      const namespaces: (readonly [string, unknown])[] = [];
      try {
        for (const item of candidate.moduleCandidate.javascriptImports) {
          const namespace = await state.load(item.specifier, item.location);
          namespaces.push([item.specifier, namespace]);
        }
      } catch (error) {
        if (error instanceof TossSyntaxError) {
          return { kind: "error", message: error.message };
        }
        throw error;
      }
      state.commit(candidate, namespaces);
      return state.evaluate(candidate);
    });
  const reset = (): Promise<void> =>
    enqueue(() => Promise.resolve(state.reset()));
  return Object.freeze({ submit, reset });
}

export type { ReplResult } from "./repl_session_state.ts";
