import type { Expression } from "./ast.ts";

const requiredSelectors = ["inspect", "toString", "at:put:"] as const;
const dynamicSelectors = new Set(["perform:", "perform:withArguments:"]);

export function collectPreludeSelectors(
  expressions: readonly Expression[],
): ReadonlySet<string> | undefined {
  const selectors = new Set<string>(requiredSelectors);
  let requiresFullPrelude = false;
  const visit = (expression: Expression): void => {
    switch (expression.kind) {
      case "block":
        expression.body.forEach(visit);
        return;
      case "array":
        expression.elements.forEach(visit);
        return;
      case "send":
        if (dynamicSelectors.has(expression.name)) requiresFullPrelude = true;
        selectors.add(expression.name);
        visit(expression.receiver);
        expression.arguments.forEach(visit);
        return;
      case "pipeline":
        if (dynamicSelectors.has(expression.name)) requiresFullPrelude = true;
        selectors.add(expression.name);
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
        requiresFullPrelude = true;
        expression.arguments.forEach(visit);
        return;
      case "await":
        visit(expression.expression);
        return;
      case "javascript":
        requiresFullPrelude = true;
        expression.bindings.forEach((binding) => visit(binding.value));
        return;
      case "export":
        visit(expression.value);
        return;
      case "javascriptImport":
        requiresFullPrelude = true;
        return;
      case "string":
      case "number":
      case "symbol":
      case "fetch":
      case "import":
        return;
      case "quotation":
        return;
      default: {
        const exhaustive: never = expression;
        throw new TypeError(JSON.stringify(exhaustive));
      }
    }
  };
  expressions.forEach(visit);
  return requiresFullPrelude ? undefined : selectors;
}
