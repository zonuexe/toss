import type { MacroContext, MacroObject, MacroValue } from "./macro_value.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { invokeMacroBlock } from "./macro_primitive.ts";

const fail = (context: MacroContext, text: string): never => {
  throw new TossSyntaxError(context.location, text);
};
const key = (value: MacroValue, context: MacroContext): string | symbol =>
  typeof value === "string" || typeof value === "symbol"
    ? value
    : fail(context, "Object key must be a string or symbol.");
export function findMacroOwner(
  object: MacroObject | null,
  name: string | symbol,
): MacroObject | null {
  let current = object;
  while (current !== null) {
    if (current.slots.has(name)) return current;
    current = current.prototype;
  }
  return null;
}
export function performMacroObject(
  receiver: MacroObject,
  name: string | symbol,
  args: readonly MacroValue[],
  context: MacroContext,
): MacroValue {
  const unary = () => {
    if (args.length !== 0) {
      fail(context, `Message ${String(name)} takes no arguments.`);
    }
  };
  const selectedKey = name;
  const owner = findMacroOwner(receiver, selectedKey);
  if (owner !== null) {
    const value = owner.slots.get(selectedKey) ?? null;
    if (isBlock(value) || isNative(value)) {
      return invokeMacroBlock(value, args, {
        ...context,
        invocation: { receiver, key: selectedKey, owner },
      });
    }
    if (args.length === 0) return value;
    return fail(context, "Object slot is not callable.");
  }
  return performObjectPrelude(receiver, name, args, context, unary);
}
export function performObjectPrelude(
  receiver: MacroObject,
  name: string | symbol,
  args: readonly MacroValue[],
  context: MacroContext,
  unary?: () => void,
): MacroValue {
  const noArguments = unary ?? (() => {
    if (args.length !== 0) {
      fail(context, `Message ${String(name)} takes no arguments.`);
    }
  });
  if (typeof name !== "string") {
    return fail(context, "Unsupported Object message.");
  }
  if (name === "clone") {
    noArguments();
    return { kind: "macroObject", slots: new Map(), prototype: receiver };
  }
  if (name === "at:") {
    if (args.length !== 1) {
      return fail(context, "Message at: expects one argument.");
    }
    const selected = key(args[0] ?? null, context);
    const owner = findMacroOwner(receiver, selected);
    if (owner === null) return fail(context, "Object has no key.");
    return owner.slots.get(selected) ?? null;
  }
  if (name === "at:put:") {
    if (args.length !== 2) {
      return fail(context, "Message at:put: expects two arguments.");
    }
    const value = args[1] ?? null;
    receiver.slots.set(key(args[0] ?? null, context), value);
    return value;
  }
  if (name === "perform:" || name === "perform:withArguments:") {
    const expected = name === "perform:" ? 1 : 2;
    if (args.length !== expected) {
      return fail(context, `Message ${name} expects ${expected} argument(s).`);
    }
    const selected = key(args[0] ?? null, context);
    if (name === "perform:") {
      const owner = findMacroOwner(receiver, selected);
      if (
        owner === null && typeof selected === "string" && selected.includes(":")
      ) {
        return fail(context, `Message ${selected} requires arguments.`);
      }
      return performMacroObject(receiver, selected, [], context);
    }
    const callArgs = args[1];
    if (!Array.isArray(callArgs)) {
      return fail(context, "Arguments must be an Array.");
    }
    if (
      typeof selected === "string" &&
      findMacroOwner(receiver, selected) === null
    ) {
      const expectedArgs = [...selected].filter((character) =>
        character === ":"
      ).length;
      if (callArgs.length !== expectedArgs) {
        return fail(
          context,
          `Message ${selected} expects ${expectedArgs} argument(s), received ${callArgs.length}.`,
        );
      }
    }
    return performMacroObject(receiver, selected, callArgs, context);
  }
  return fail(context, `Unsupported Object message ${name}.`);
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
