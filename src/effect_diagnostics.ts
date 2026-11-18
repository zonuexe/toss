/** A snapshot delivered when a Toss failure reaches a host boundary. */
export interface EffectFailureDiagnostic {
  readonly boundary:
    | "entry"
    | "callback"
    | "promise"
    | "unobserved-async"
    | "repl";
  /** The value thrown or rejected at the boundary, with its identity preserved. */
  readonly error: unknown;
  readonly cleanupDescriptions: readonly string[];
  readonly handlerDescriptions: readonly string[];
}

export interface EffectObserverError {
  readonly diagnostic: EffectFailureDiagnostic;
  /** The observer's original thrown value or rejection reason. */
  readonly cause: unknown;
  readonly kind: "throw" | "rejection";
}

/** Host module exports used by the experimental effect compiler. */
export interface EffectDiagnosticHost {
  /** Called before the failure is exposed. The runtime does not await the return value. */
  readonly onEffectFailure: (
    diagnostic: EffectFailureDiagnostic,
  ) => void | PromiseLike<void>;
  /** Receives observer errors. Failures of this hook are discarded without retry. */
  readonly onEffectObserverError?: (
    failure: EffectObserverError,
  ) => void | PromiseLike<void>;
}

// Emitted inside the runtime so reporting shares the host boundary rules.
export const effectDiagnosticRuntime = `
const onEffectFailure = effectDiagnosticHost?.onEffectFailure;
const onEffectObserverError = effectDiagnosticHost?.onEffectObserverError;
if (effectDiagnosticHost !== undefined &&
    (typeof onEffectFailure !== "function" ||
     (onEffectObserverError !== undefined && typeof onEffectObserverError !== "function"))) {
  throw new TypeError("Expected onEffectFailure and an optional onEffectObserverError function.");
}
function notifyEffectObserverError(diagnostic, cause, kind) {
  if (onEffectObserverError === undefined) return;
  try {
    withEffectBoundary(() => {
      const result = onEffectObserverError(Object.freeze({diagnostic, cause, kind}));
      if (result !== undefined) Promise.resolve(result).catch(() => {});
    });
  } catch {
    // A secondary reporter failure must not replace the Toss failure or recurse.
  }
}
function notifyEffectFailure(diagnostic) {
  try {
    withEffectBoundary(() => {
      const result = onEffectFailure(diagnostic);
      if (result !== undefined) {
        Promise.resolve(result).catch((cause) => notifyEffectObserverError(diagnostic, cause, "rejection"));
      }
    });
  } catch (cause) {
    notifyEffectObserverError(diagnostic, cause, "throw");
  }
}
`;
