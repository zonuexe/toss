import type { Expression } from "./ast.ts";
import { containsDirectAwait } from "./codegen_analysis.ts";

export function emitBlock(
  expression: Extract<Expression, { readonly kind: "block" }>,
  carrier: string,
  emit: (
    expression: Expression,
    carrier: string,
    discardResult?: boolean,
  ) => string,
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
  // Internal result boxes must settle without assimilating an inherited then.
  const body = expression.body.map((item, index) => {
    if (index !== expression.body.length - 1) {
      return `${emit(item, "scope", true)};`;
    }
    const value = emit(item, "scope");
    if (!asynchronous) return `return ${value};`;
    return `const result = ${value};
if (asyncTask === undefined) return {value: result, then: undefined};
if (hasEffectOwnedWork(asyncTask)) await joinEffectOwnedWork(asyncTask);
return {value: checkEffectTask(result, asyncTask), then: undefined};`;
  });
  const functionKind = asynchronous ? "async function" : "function";
  return `((captured) => ${
    asynchronous ? "markAsyncBlock(" : ""
  }${functionKind}(${parameters.join(", ")}) {
const invocation = this;
${
    asynchronous && expression.body.some(containsDirectAwait)
      ? "let awaitable, awaitBox;"
      : ""
  }
${
    asynchronous
      ? 'const asyncTask = invocation?.kind === "tossAsyncInvocation" ? invocation : undefined;\ntry {'
      : ""
  }
const scope = blockEnvironment(captured, ${
    JSON.stringify(expression.location)
  }, ${JSON.stringify(parameterLocations)});
const currentTask = ${asynchronous ? "asyncTask" : "invocation?.asyncTask"};
if (currentTask !== undefined) scope.asyncTask = currentTask;
const methodContext = ${
    asynchronous ? "asyncTask?.context ?? " : ""
  }(invocation?.kind === "tossInvocation" ? invocation.context : undefined);
if (methodContext !== undefined) {
${
    asynchronous
      ? "if (asyncTask !== undefined) asyncTask.context = undefined;"
      : ""
  }
scope.superContext = methodContext;
lexicalEnvironment(scope, ${
    JSON.stringify(expression.location)
  }).bindings.set(Symbol.for("self"), methodContext.receiver);
}
${
    [
      ...bindings,
      ...(body.length === 0
        ? [
          asynchronous
            ? "return {value: null, then: undefined};"
            : "return null;",
        ]
        : body),
    ].join("\n")
  }
${
    asynchronous
      ? `} catch (error) {
  if (asyncTask !== undefined && (asyncTask.cancellation !== undefined || hasEffectOwnedWork(asyncTask))) {
    error = await settleEffectTaskFailure(asyncTask, error, ${
        JSON.stringify(expression.location)
      });
  }
  throw asyncTask === undefined ? error : preserveOwnedAsyncRejection(asyncTask, error);
} finally {
  if (asyncTask !== undefined) finishEffectAsyncTask(asyncTask);
}`
      : ""
  }
}${asynchronous ? "))" : ")"}(${carrier})`;
}
