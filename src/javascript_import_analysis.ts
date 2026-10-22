import type { Expression } from "./ast.ts";

export function collectJavaScriptImports(
  expressions: readonly Expression[],
): readonly string[] {
  const specifiers: string[] = [];
  const seen = new Set<string>();
  const visit = (expression: Expression): void => {
    switch (expression.kind) {
      case "javascriptImport":
        if (!seen.has(expression.specifier)) {
          seen.add(expression.specifier);
          specifiers.push(expression.specifier);
        }
        return;
      case "block":
        expression.body.forEach(visit);
        return;
      case "array":
        expression.elements.forEach(visit);
        return;
      case "send":
        visit(expression.receiver);
        expression.arguments.forEach(visit);
        return;
      case "pipeline":
        visit(expression.input);
        visit(expression.receiver);
        expression.arguments.forEach(visit);
        return;
      case "extend":
        visit(expression.input);
        expression.entries.forEach((entry) => {
          visit(entry.key);
          visit(entry.value);
        });
        return;
      case "super":
        expression.arguments.forEach(visit);
        return;
      case "export":
        visit(expression.value);
        return;
      case "await":
        visit(expression.expression);
        return;
      case "javascript":
        expression.bindings.forEach((binding) => visit(binding.value));
        return;
      case "string":
      case "number":
      case "symbol":
      case "fetch":
      case "import":
      case "quotation":
        return;
      default: {
        const exhaustive: never = expression;
        throw new TypeError(JSON.stringify(exhaustive));
      }
    }
  };
  expressions.forEach(visit);
  return specifiers;
}
