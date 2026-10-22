import { TossSyntaxError } from "./diagnostic.ts";
import type { MacroContext, MacroValue } from "./macro_value.ts";
import type { MacroBlock, MacroNative } from "./macro_value.ts";
import { invokeMacroBlock } from "./macro_block.ts";
import { performMacroObject } from "./macro_object.ts";
import { performMacroArray } from "./macro_array.ts";
import { isMacroSyntax, performMacroSyntax } from "./macro_syntax.ts";

const fail = (context: MacroContext, reason: string): never => {
  throw new TossSyntaxError(context.location, reason);
};
const number = (value: MacroValue, context: MacroContext): number =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : fail(context, "Number argument required.");
const block = (
  value: MacroValue,
  context: MacroContext,
): MacroBlock | MacroNative =>
  value !== null && typeof value === "object" && "kind" in value &&
    (value.kind === "macroBlock" || value.kind === "macroNative")
    ? value
    : fail(context, "Block argument required.");

export { invokeMacroBlock } from "./macro_block.ts";

export function performMacro(
  receiver: MacroValue,
  name: string,
  args: readonly MacroValue[],
  context: MacroContext,
): MacroValue {
  const unary = (): void => {
    if (args.length !== 0) fail(context, `Message ${name} takes no arguments.`);
  };
  const binary = (): MacroValue => {
    if (args.length !== 1) {
      return fail(context, `Message ${name} expects one argument.`);
    }
    return args[0] ?? null;
  };
  if (typeof receiver === "number") {
    switch (name) {
      case "toString":
      case "inspect":
        unary();
        return String(receiver);
      case "negated":
        unary();
        return -receiver;
      case "add:":
        return finite(receiver + number(binary(), context), context);
      case "subtract:":
        return finite(receiver - number(binary(), context), context);
      case "multiplyBy:":
        return finite(receiver * number(binary(), context), context);
      case "divideBy:":
      case "remainder:": {
        const arg = number(binary(), context);
        if (arg === 0) {
          return fail(
            context,
            name === "divideBy:" ? "Division by zero." : "Remainder by zero.",
          );
        }
        return finite(
          name === "divideBy:" ? receiver / arg : receiver % arg,
          context,
        );
      }
      case "equals:":
        return receiver === number(binary(), context);
      case "lessThan:":
        return receiver < number(binary(), context);
      case "greaterThan:":
        return receiver > number(binary(), context);
      case "lessThanOrEqual:":
        return receiver <= number(binary(), context);
      case "greaterThanOrEqual:":
        return receiver >= number(binary(), context);
      case "times:": {
        if (!Number.isSafeInteger(receiver) || receiver < 0) {
          return fail(context, "Nonnegative safe integer required.");
        }
        const selected = block(binary(), context);
        let result: MacroValue = null;
        for (let i = 0; i < receiver; i++) {
          context.state.consume(context.location);
          result = invokeMacroBlock(selected, [], context);
        }
        return result;
      }
      default:
        return fail(context, `Unsupported Number message ${name}.`);
    }
  }
  if (typeof receiver === "boolean") {
    switch (name) {
      case "not":
        unary();
        return !receiver;
      case "toString":
      case "inspect":
        unary();
        return String(receiver);
      case "ifTrue:":
      case "ifFalse:": {
        const selected = block(binary(), context);
        return receiver === (name === "ifTrue:")
          ? invokeMacroBlock(selected, [], context)
          : null;
      }
      case "ifTrue:ifFalse:": {
        if (args.length !== 2) {
          return fail(context, "Expected two conditional Blocks.");
        }
        const yes = block(args[0] ?? null, context);
        const no = block(args[1] ?? null, context);
        return invokeMacroBlock(receiver ? yes : no, [], context);
      }
      default:
        return fail(context, `Unsupported Boolean message ${name}.`);
    }
  }
  if (typeof receiver === "symbol") {
    switch (name) {
      case "bind:":
        return context.environment.bind(receiver, binary());
      case "equals:": {
        const other = binary();
        if (typeof other !== "symbol") {
          return fail(context, "Symbol argument required.");
        }
        return receiver === other;
      }
      case "toString":
        unary();
        return Symbol.keyFor(receiver) ?? "<unique>";
      case "inspect":
        unary();
        {
          const key = Symbol.keyFor(receiver);
          return key === undefined ? "#<unique>" : `#${key}`;
        }
      default:
        return fail(context, `Unsupported Symbol message ${name}.`);
    }
  }
  if (typeof receiver === "string") {
    unary();
    if (name === "toString") return receiver;
    if (name === "inspect") return JSON.stringify(receiver);
  }
  if (receiver === null) {
    unary();
    if (name === "toString" || name === "inspect") return "nil";
  }
  if (
    receiver !== null && typeof receiver === "object" && "kind" in receiver &&
    (receiver.kind === "macroBlock" || receiver.kind === "macroNative")
  ) {
    if (name === "value") return invokeMacroBlock(receiver, args, context);
    if (/^(value:)+$/.test(name)) {
      return invokeMacroBlock(receiver, args, context);
    }
  }
  if (isMacroSyntax(receiver)) {
    return performMacroSyntax(receiver, name, args, context);
  }
  if (Array.isArray(receiver)) {
    return performMacroArray(receiver, name, args, context);
  }
  if (isMacroObject(receiver)) {
    return performMacroObject(receiver, name, args, context);
  }
  return fail(context, `Unsupported message ${name}.`);
}

function isMacroObject(
  value: MacroValue,
): value is import("./macro_value.ts").MacroObject {
  return value !== null && typeof value === "object" && "kind" in value &&
    value.kind === "macroObject";
}

function finite(value: number, context: MacroContext): number {
  return Number.isFinite(value)
    ? value
    : fail(context, "Finite number required.");
}
