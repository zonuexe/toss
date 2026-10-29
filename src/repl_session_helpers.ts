export type Evaluation =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "runtimeError"; readonly message: string };

export type Inspection =
  | { readonly kind: "value"; readonly value: string }
  | { readonly kind: "runtimeError"; readonly message: string };

export function hostCause(cause: unknown): string {
  if (typeof cause !== "object" || cause === null) {
    return primitiveCause(cause);
  }
  try {
    if (cause instanceof Error) {
      const message: unknown = Reflect.get(cause, "message");
      return typeof message === "string"
        ? message
        : "Error rejection without a string message";
    }
    return "non-Error object rejection";
  } catch (formattingFailure) {
    return primitiveCause(formattingFailure);
  }
}

export function countLines(source: string): number {
  const breaks = source.match(/\r\n|\r|\n/g)?.length ?? 0;
  return Math.max(1, breaks + (/[\r\n]$/.test(source) ? 0 : 1));
}

export function readEvaluation(value: unknown): Evaluation {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(
      "Generated REPL evaluation returned an invalid result.",
    );
  }
  const kind = Reflect.get(value, "kind");
  const message = Reflect.get(value, "message");
  switch (kind) {
    case "runtimeError":
      if (typeof message === "string") return { kind, message };
      break;
    case "value":
      return { kind, value: Reflect.get(value, "value") };
    default:
      break;
  }
  throw new TypeError("Generated REPL evaluation returned an invalid result.");
}

export function readInspection(value: unknown): Inspection {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(
      "Generated REPL inspection returned an invalid result.",
    );
  }
  const kind = Reflect.get(value, "kind");
  const message = Reflect.get(value, "message");
  switch (kind) {
    case "runtimeError":
      if (typeof message === "string") return { kind, message };
      break;
    case "value": {
      const display = Reflect.get(value, "value");
      if (typeof display === "string") return { kind, value: display };
      break;
    }
    default:
      break;
  }
  throw new TypeError("Generated REPL inspection returned an invalid result.");
}

function primitiveCause(cause: unknown): string {
  switch (typeof cause) {
    case "string":
      return cause;
    case "number":
    case "boolean":
    case "bigint":
    case "symbol":
    case "undefined":
      return String(cause);
    case "function":
    case "object":
      return "host rejection could not be formatted";
    default:
      return "unprintable host rejection";
  }
}
