import type { Expression } from "./ast.ts";

export function emitBlock(
  expression: Extract<Expression, { readonly kind: "block" }>,
  carrier: string,
  emit: (expression: Expression, carrier: string) => string,
): string {
  const parameters = expression.parameters.map((_, index) => `arg${index}`);
  const parameterLocations = expression.parameterLocations ??
    expression.parameters.map(() => expression.location);
  const bindings = expression.parameters.map((name, index) =>
    `lexicalEnvironment(scope, ${
      JSON.stringify(parameterLocations[index])
    }).bindings.set(Symbol.for(${JSON.stringify(name)}), arg${index});`
  );
  const asynchronous = expression.asynchronous === true;
  const body = expression.body.map((item, index) =>
    `${index === expression.body.length - 1 ? "return " : ""}${
      asynchronous && index === expression.body.length - 1
        ? `{value: ${emit(item, "scope")}}`
        : emit(item, "scope")
    };`
  );
  const functionKind = asynchronous ? "async function" : "function";
  return `((captured) => ${
    asynchronous ? "markAsyncBlock(" : ""
  }${functionKind}(${parameters.join(", ")}) {
const invocation = this;
const {carrier: scope} = blockEnvironment(captured, ${
    JSON.stringify(expression.location)
  }, ${JSON.stringify(parameterLocations)});
if (invocation?.kind === "tossInvocation") {
scope.superContext = invocation.context;
lexicalEnvironment(scope, ${
    JSON.stringify(expression.location)
  }).bindings.set(Symbol.for("self"), invocation.context.receiver);
}
${
    [
      ...bindings,
      ...(body.length === 0
        ? [asynchronous ? "return {value: null};" : "return null;"]
        : body),
    ].join("\n")
  }
}${asynchronous ? "))" : ")"}(${carrier})`;
}
