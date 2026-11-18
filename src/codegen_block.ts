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
  const body = expression.body.map((item, index) => {
    const value = emit(item, "scope");
    if (index !== expression.body.length - 1) return `${value};`;
    if (!asynchronous) return `return ${value};`;
    return `const result = ${value};
if (asyncTask === undefined) return {value: result};
if (hasEffectOwnedWork(asyncTask)) await joinEffectOwnedWork(asyncTask);
return {value: checkEffectTask(result, asyncTask)};`;
  });
  const functionKind = asynchronous ? "async function" : "function";
  return `((captured) => ${
    asynchronous ? "markAsyncBlock(" : ""
  }${functionKind}(${parameters.join(", ")}) {
const invocation = this;
${asynchronous ? "const asyncTask = invocation?.asyncTask;\ntry {" : ""}
const {carrier: scope} = blockEnvironment(captured, ${
    JSON.stringify(expression.location)
  }, ${JSON.stringify(parameterLocations)});
if (invocation?.asyncTask !== undefined) scope.asyncTask = invocation.asyncTask;
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
${
    asynchronous
      ? `} catch (error) {
  if (asyncTask !== undefined && (asyncTask.cancellation !== undefined || hasEffectOwnedWork(asyncTask))) {
    throw await settleEffectTaskFailure(asyncTask, error, ${
        JSON.stringify(expression.location)
      });
  }
  throw error;
} finally {
  if (asyncTask !== undefined) finishEffectAsyncTask(asyncTask);
}`
      : ""
  }
}${asynchronous ? "))" : ")"}(${carrier})`;
}
