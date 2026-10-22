import { TossSyntaxError } from "./diagnostic.ts";
import { evaluateMacroExpression } from "./macro_evaluate.ts";
import {
  type MacroContext,
  MacroEnvironment,
  macroEnvironmentFor,
  type MacroValue,
} from "./macro_value.ts";

export function invokeMacroBlock(
  value: MacroValue,
  args: readonly MacroValue[],
  context: MacroContext,
): MacroValue {
  if (value === null || typeof value !== "object" || !("kind" in value)) {
    throw new TossSyntaxError(context.location, "Block argument required.");
  }
  if (value.kind === "macroNative") {
    if (value.arity !== args.length) {
      throw new TossSyntaxError(
        context.location,
        `Expected ${value.arity} block arguments, got ${args.length}.`,
      );
    }
    return value.invoke(args, context);
  }
  if (value.kind !== "macroBlock") {
    throw new TossSyntaxError(context.location, "Block argument required.");
  }
  const selected = value;
  if (selected.parameters.length !== args.length) {
    throw new TossSyntaxError(
      context.location,
      `Expected ${selected.parameters.length} block arguments, got ${args.length}.`,
    );
  }
  const method = context.invocation ?? selected.capturedContext.method;
  const leave = context.state.enter(context.location);
  try {
    const scopes = new Map(selected.capturedScopes);
    const blockId = selected.location.scope?.id ?? 0;
    const environment = new MacroEnvironment(
      scopes.get(blockId) ?? selected.captured,
    );
    scopes.set(blockId, environment);
    const parameterLocations = selected.parameterLocations;
    const parameterScopes = new Map<number, MacroEnvironment>();
    const parameterEnvironments = selected.parameters.map((_, index) => {
      const location = parameterLocations?.[index] ?? selected.location;
      const id = parameterLocations === undefined
        ? blockId
        : location.scope?.id ?? 0;
      if (id === blockId) return environment;
      let selectedEnvironment = parameterScopes.get(id);
      if (selectedEnvironment === undefined) {
        selectedEnvironment = new MacroEnvironment(
          scopes.get(id) ?? selected.rootEnvironment,
        );
        scopes.set(id, selectedEnvironment);
        parameterScopes.set(id, selectedEnvironment);
      }
      return selectedEnvironment;
    });
    if (method !== undefined) {
      environment.bind(Symbol.for("self"), method.receiver);
    }
    const bodyContext: MacroContext = {
      state: context.state,
      environment,
      location: context.location,
      scopes,
      rootEnvironment: selected.rootEnvironment,
      ...(context.quotation === undefined
        ? {}
        : { quotation: context.quotation }),
      ...(method === undefined ? {} : { method }),
    };
    selected.parameters.forEach((parameter, index) =>
      (parameterEnvironments[index] ?? environment).bind(
        Symbol.for(parameter),
        args[index] ?? null,
      )
    );
    let result: MacroValue = null;
    for (const expression of selected.body) {
      result = evaluateMacroExpression(expression, {
        ...bodyContext,
        environment: macroEnvironmentFor({
          ...bodyContext,
          scopes,
          rootEnvironment: selected.rootEnvironment,
          environment,
        }, expression.location),
      });
    }
    return result;
  } finally {
    leave();
  }
}
