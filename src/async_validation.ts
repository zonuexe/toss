import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";

export function validateAsyncExpressions(
  expressions: readonly Expression[],
): void {
  const visit = (expression: Expression, allowed: boolean): void => {
    switch (expression.kind) {
      case "await":
        if (!allowed) {
          throw new TossSyntaxError(
            expression.location,
            "%await is only valid directly inside an async Block.",
          );
        }
        visit(expression.expression, allowed);
        return;
      case "block":
        expression.body.forEach((item) =>
          visit(item, expression.asynchronous === true)
        );
        return;
      case "array":
        expression.elements.forEach((item) => visit(item, allowed));
        return;
      case "send":
        visit(expression.receiver, allowed);
        expression.arguments.forEach((item) => visit(item, allowed));
        return;
      case "pipeline":
        visit(expression.input, allowed);
        visit(expression.receiver, allowed);
        expression.arguments.forEach((item) => visit(item, allowed));
        return;
      case "extend":
        visit(expression.input, allowed);
        expression.entries.forEach((entry) => {
          visit(entry.key, allowed);
          visit(entry.value, allowed);
        });
        return;
      case "super":
        expression.arguments.forEach((item) => visit(item, allowed));
        return;
      case "export":
        visit(expression.value, allowed);
        return;
      case "javascript":
        expression.bindings.forEach((binding) => visit(binding.value, allowed));
        return;
      case "string":
      case "number":
      case "symbol":
      case "fetch":
      case "import":
      case "javascriptImport":
      case "quotation":
        return;
      default: {
        const exhaustive: never = expression;
        throw new TypeError(JSON.stringify(exhaustive));
      }
    }
  };
  expressions.forEach((expression) => visit(expression, false));
}
