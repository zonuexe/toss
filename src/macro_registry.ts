import type { Expression } from "./ast.ts";
import type { SourceLocation } from "./diagnostic.ts";

export type LocalMacroDefinition = {
  readonly name: string;
  readonly block: Extract<Expression, { readonly kind: "block" }>;
  readonly location: SourceLocation;
  readonly bodyStart: SourceLocation;
  readonly bodyEnd: SourceLocation;
};

export class LocalMacroRegistry {
  readonly definitions: LocalMacroDefinition[] = [];
  expansions = 0;

  register(definition: LocalMacroDefinition): void {
    this.definitions.push(definition);
  }

  available(
    name: string,
    location: SourceLocation,
  ): LocalMacroDefinition | undefined {
    return [...this.definitions].reverse().find((definition) =>
      definition.name === name &&
      (precedes(definition.location, location) ||
        within(definition.bodyStart, definition.bodyEnd, location))
    );
  }
}

export function precedes(left: SourceLocation, right: SourceLocation): boolean {
  return left.file === right.file &&
    (left.line < right.line ||
      left.line === right.line && left.column < right.column);
}

function within(
  start: SourceLocation,
  end: SourceLocation,
  location: SourceLocation,
): boolean {
  return start.file === location.file && end.file === location.file &&
    !precedes(location, start) && !precedes(end, location);
}
