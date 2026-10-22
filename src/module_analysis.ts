import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { validateAsyncExpressions } from "./async_validation.ts";

export type ModuleImport = Extract<Expression, { readonly kind: "import" }>;
export type ModuleExport = Extract<Expression, { readonly kind: "export" }>;

export function analyzeModule(
  expressions: readonly Expression[],
  file: string,
  requiredExport: boolean,
): {
  readonly imports: readonly ModuleImport[];
  readonly exported?: ModuleExport;
} {
  validateAsyncExpressions(expressions);
  const imports: ModuleImport[] = [];
  let exported: ModuleExport | undefined;
  const visit = (expression: Expression, topLevel: boolean): void => {
    switch (expression.kind) {
      case "import":
        imports.push(expression);
        return;
      case "javascriptImport":
        return;
      case "export":
        if (!topLevel) {
          throw new TossSyntaxError(
            expression.location,
            "%export is only valid as a standalone top-level statement.",
          );
        }
        if (exported !== undefined) {
          throw new TossSyntaxError(
            expression.location,
            "A module may contain only one %export.",
          );
        }
        exported = expression;
        visit(expression.value, false);
        return;
      case "block":
        expression.body.forEach((item) => visit(item, false));
        return;
      case "array":
        expression.elements.forEach((item) => visit(item, false));
        return;
      case "send":
        visit(expression.receiver, false);
        expression.arguments.forEach((item) => visit(item, false));
        return;
      case "pipeline":
        visit(expression.input, false);
        visit(expression.receiver, false);
        expression.arguments.forEach((item) => visit(item, false));
        return;
      case "extend":
        visit(expression.input, false);
        expression.entries.forEach((entry) => {
          visit(entry.key, false);
          visit(entry.value, false);
        });
        return;
      case "super":
        expression.arguments.forEach((item) => visit(item, false));
        return;
      case "javascript":
        expression.bindings.forEach((binding) => visit(binding.value, false));
        return;
      case "await":
        visit(expression.expression, false);
        return;
      case "quotation":
        throw new TossSyntaxError(
          expression.location,
          "Quotation is only valid during macro expansion.",
        );
      case "string":
      case "number":
      case "symbol":
      case "fetch":
        return;
      default: {
        const exhaustive: never = expression;
        throw new TypeError(JSON.stringify(exhaustive));
      }
    }
  };
  expressions.forEach((expression) => visit(expression, true));
  if (requiredExport && exported === undefined) {
    const location = expressions[0]?.location ?? { file, line: 1, column: 1 };
    throw new TossSyntaxError(
      location,
      "An imported module must contain exactly one top-level %export.",
    );
  }
  return exported === undefined ? { imports } : { imports, exported };
}
