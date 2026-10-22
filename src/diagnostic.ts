export type SourceLocation = {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly scope?: {
    readonly kind: "definition" | "caller" | "introduced";
    readonly id: number;
  };
  readonly trace?: readonly {
    readonly name: string;
    readonly definition: SourceLocation;
    readonly invocation: SourceLocation;
  }[];
};

export function mergeMacroTrace(
  ...traces: readonly (SourceLocation["trace"] | undefined)[]
): NonNullable<SourceLocation["trace"]> {
  const merged: Array<NonNullable<SourceLocation["trace"]>[number]> = [];
  for (const trace of traces) {
    for (const entry of trace ?? []) {
      if (
        !merged.some((existing) =>
          existing.name === entry.name &&
          existing.invocation.file === entry.invocation.file &&
          existing.invocation.line === entry.invocation.line &&
          existing.invocation.column === entry.invocation.column
        )
      ) merged.push(entry);
    }
  }
  return merged;
}

export class TossSyntaxError extends Error {
  override readonly name = "TossSyntaxError";

  constructor(
    readonly location: SourceLocation,
    readonly reason: string,
    readonly trace: SourceLocation["trace"] = location.trace,
  ) {
    super(
      `${location.file}:${location.line}:${location.column}: SyntaxError: ${reason}${
        formatTrace(trace)
      }`,
    );
  }
}

function formatTrace(trace: SourceLocation["trace"]): string {
  return trace?.map((entry) =>
    `\n  expanded ${entry.name} at ${entry.invocation.file}:${entry.invocation.line}:${entry.invocation.column} (defined at ${entry.definition.file}:${entry.definition.line}:${entry.definition.column})`
  ).join("") ?? "";
}
