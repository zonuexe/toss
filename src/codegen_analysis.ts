import type { Expression } from "./ast.ts";

export function containsDirectAwait(expression: Expression): boolean {
  switch (expression.kind) {
    case "await":
      return true;
    case "block":
      return false;
    case "array":
      return expression.elements.some(containsDirectAwait);
    case "send":
      return containsDirectAwait(expression.receiver) ||
        expression.arguments.some(containsDirectAwait);
    case "pipeline":
      return containsDirectAwait(expression.input) ||
        containsDirectAwait(expression.receiver) ||
        expression.arguments.some(containsDirectAwait);
    case "extend":
      return containsDirectAwait(expression.input) ||
        expression.entries.some((entry) =>
          containsDirectAwait(entry.key) || containsDirectAwait(entry.value)
        );
    case "super":
      return expression.arguments.some(containsDirectAwait);
    case "export":
      return containsDirectAwait(expression.value);
    case "javascript":
      return expression.bindings.some((binding) =>
        containsDirectAwait(binding.value)
      );
    case "string":
    case "number":
    case "symbol":
    case "fetch":
    case "import":
    case "javascriptImport":
    case "quotation":
      return false;
    default: {
      const exhaustive: never = expression;
      throw new TypeError(JSON.stringify(exhaustive));
    }
  }
}
