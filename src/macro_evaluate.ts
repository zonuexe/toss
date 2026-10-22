import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { invokeMacroBlock, performMacro } from "./macro_primitive.ts";
import { evaluateMacroQuotation } from "./macro_quote.ts";
import { findMacroOwner, performObjectPrelude } from "./macro_object.ts";
import {
  type MacroContext,
  macroEnvironmentFor,
  MacroState,
  type MacroValue,
} from "./macro_value.ts";

export function evaluateMacroExpression(
  expression: Expression,
  context: MacroContext,
): MacroValue {
  context.state.consume(expression.location);
  const here = {
    ...context,
    location: expression.location,
    environment: macroEnvironmentFor(context, expression.location),
  };
  switch (expression.kind) {
    case "string":
    case "number":
      return expression.value;
    case "symbol":
      return Symbol.for(expression.name);
    case "fetch":
      return here.environment.fetch(
        Symbol.for(expression.name),
        expression.location,
      );
    case "block":
      if (expression.asynchronous === true) {
        return unsupported(
          here,
          "Async Blocks are unavailable during macro evaluation.",
        );
      }
      return {
        kind: "macroBlock",
        parameters: expression.parameters,
        ...(expression.parameterLocations === undefined
          ? {}
          : { parameterLocations: expression.parameterLocations }),
        location: expression.location,
        body: expression.body,
        captured: here.environment,
        capturedScopes: new Map(context.scopes ?? [[0, context.environment]]),
        rootEnvironment: context.rootEnvironment ?? context.environment,
        capturedContext: context,
      };
    case "send": {
      const receiver = evaluateMacroExpression(expression.receiver, context);
      const args = expression.arguments.map((argument) =>
        evaluateMacroExpression(argument, context)
      );
      return performMacro(receiver, expression.name, args, here);
    }
    case "pipeline": {
      const input = evaluateMacroExpression(expression.input, context);
      const receiver = evaluateMacroExpression(expression.receiver, context);
      const args = expression.arguments.map((argument) =>
        evaluateMacroExpression(argument, context)
      );
      args.push(input);
      return performMacro(receiver, expression.name, args, here);
    }
    case "array":
      return expression.elements.map((element) =>
        evaluateMacroExpression(element, context)
      );
    case "extend": {
      const target = evaluateMacroExpression(expression.input, context);
      if (!isMacroObject(target)) {
        return unsupported(here, "Object required for extension.");
      }
      for (const entry of expression.entries) {
        const key = evaluateMacroExpression(entry.key, context);
        const value = evaluateMacroExpression(entry.value, context);
        performMacro(target, "at:put:", [key, value], here);
      }
      return target;
    }
    case "super": {
      const args = expression.arguments.map((argument) =>
        evaluateMacroExpression(argument, context)
      );
      const method = context.method;
      if (method === undefined) {
        return unsupported(
          here,
          "%super requires a method invocation context.",
        );
      }
      const owner = findMacroOwner(method.owner.prototype, method.key);
      if (owner !== null) {
        const value = owner.slots.get(method.key) ?? null;
        if (isBlock(value) || isNative(value)) {
          return invokeMacroBlock(value, args, {
            ...here,
            invocation: { receiver: method.receiver, key: method.key, owner },
          });
        }
        if (args.length === 0) return value;
        return unsupported(here, "Object slot is not callable.");
      }
      if (typeof method.key === "string") {
        const expected = [...method.key].filter((character) =>
          character === ":"
        ).length;
        if (args.length !== expected) {
          return unsupported(
            here,
            `Message ${method.key} expects ${expected} argument(s).`,
          );
        }
        return performObjectPrelude(method.receiver, method.key, args, here);
      }
      return unsupported(
        here,
        `Unknown parent message ${Symbol.keyFor(method.key) ?? "#<unique>"}.`,
      );
    }
    case "import":
    case "javascriptImport":
    case "export":
    case "javascript":
    case "await":
      return unsupported(
        here,
        `${expression.kind} is unavailable during macro evaluation.`,
      );
    case "quotation":
      return evaluateMacroQuotation(expression, here);
    default: {
      const exhaustive: never = expression;
      return exhaustive;
    }
  }
}

export function evaluateMacroExpressions(
  expressions: readonly Expression[],
  environment?: MacroContext["environment"],
): MacroValue {
  const selectedEnvironment = environment ?? macroRootEnvironment();
  const final = expressions.at(-1)?.location ??
    { file: "<macro>", line: 1, column: 1 };
  const context: MacroContext = {
    state: new MacroState(),
    environment: selectedEnvironment,
    scopes: new Map([[0, selectedEnvironment]]),
    rootEnvironment: selectedEnvironment,
    location: final,
  };
  let result: MacroValue = null;
  for (const expression of expressions) {
    result = evaluateMacroExpression(expression, context);
  }
  return result;
}

function isBlock(
  value: MacroValue,
): value is import("./macro_value.ts").MacroBlock {
  return value !== null && typeof value === "object" && "kind" in value &&
    value.kind === "macroBlock";
}
function isNative(
  value: MacroValue,
): value is import("./macro_value.ts").MacroNative {
  return value !== null && typeof value === "object" && "kind" in value &&
    value.kind === "macroNative";
}
function isMacroObject(
  value: MacroValue,
): value is import("./macro_value.ts").MacroObject {
  return value !== null && typeof value === "object" && "kind" in value &&
    value.kind === "macroObject";
}
function unsupported(context: MacroContext, reason: string): never {
  throw new TossSyntaxError(context.location, reason);
}
import { macroRootEnvironment } from "./macro_value.ts";
