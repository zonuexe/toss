import type { Expression } from "./ast.ts";
import type { SourceLocation } from "./diagnostic.ts";

export function shiftExpressionLocations(
  expression: Expression,
  start: SourceLocation,
): Expression {
  const move = (location: SourceLocation): SourceLocation => ({
    ...location,
    line: location.line + start.line - 1,
    column: location.line === 1
      ? location.column + start.column - 1
      : location.column,
  });
  switch (expression.kind) {
    case "block":
      return {
        ...expression,
        location: move(expression.location),
        body: expression.body.map((item) =>
          shiftExpressionLocations(item, start)
        ),
      };
    case "array":
      return {
        ...expression,
        location: move(expression.location),
        elements: expression.elements.map((item) =>
          shiftExpressionLocations(item, start)
        ),
      };
    case "send":
      return {
        ...expression,
        location: move(expression.location),
        receiver: shiftExpressionLocations(expression.receiver, start),
        arguments: expression.arguments.map((item) =>
          shiftExpressionLocations(item, start)
        ),
      };
    case "pipeline":
      return {
        ...expression,
        location: move(expression.location),
        input: shiftExpressionLocations(expression.input, start),
        receiver: shiftExpressionLocations(expression.receiver, start),
        arguments: expression.arguments.map((item) =>
          shiftExpressionLocations(item, start)
        ),
      };
    case "extend":
      return {
        ...expression,
        location: move(expression.location),
        input: shiftExpressionLocations(expression.input, start),
        entries: expression.entries.map((entry) => ({
          ...entry,
          location: move(entry.location),
          key: shiftExpressionLocations(entry.key, start),
          value: shiftExpressionLocations(entry.value, start),
        })),
      };
    case "super":
      return {
        ...expression,
        location: move(expression.location),
        arguments: expression.arguments.map((item) =>
          shiftExpressionLocations(item, start)
        ),
      };
    case "export":
      return {
        ...expression,
        location: move(expression.location),
        value: shiftExpressionLocations(expression.value, start),
      };
    case "javascript":
      return {
        ...expression,
        location: move(expression.location),
        bindings: expression.bindings.map((binding) => ({
          ...binding,
          value: shiftExpressionLocations(binding.value, start),
        })),
      };
    case "import":
    case "fetch":
    case "symbol":
    case "number":
    case "string":
      return { ...expression, location: move(expression.location) };
    default: {
      const exhaustive: never = expression;
      throw new TypeError(JSON.stringify(exhaustive));
    }
  }
}
