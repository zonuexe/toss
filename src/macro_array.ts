import type { MacroContext, MacroValue } from "./macro_value.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { invokeMacroBlock, performMacro } from "./macro_primitive.ts";

const fail = (context: MacroContext, reason: string): never => {
  throw new TossSyntaxError(context.location, reason);
};
export function performMacroArray(
  receiver: MacroValue[],
  name: string,
  args: readonly MacroValue[],
  context: MacroContext,
): MacroValue {
  if (name === "length" || name === "toString" || name === "inspect") {
    if (args.length) {
      return fail(context, `Message ${name} takes no arguments.`);
    }
    if (name === "length") return receiver.length;
    return inspect(receiver, context);
  }
  if (name === "at:" || name === "at:put:") {
    const expected = name === "at:" ? 1 : 2;
    if (args.length !== expected) {
      return fail(context, `Message ${name} expects ${expected} argument(s).`);
    }
    const index = args[0];
    if (
      typeof index !== "number" || !Number.isSafeInteger(index) || index < 0
    ) return fail(context, "Array index must be a nonnegative safe integer.");
    if (index >= receiver.length) {
      return fail(context, "Array index is out of bounds.");
    }
    if (name === "at:") return receiver[index] ?? null;
    const value = args[1] ?? null;
    receiver[index] = value;
    return value;
  }
  if (name === "map:" || name === "filter:" || name === "reduce:with:") {
    const expected = name === "reduce:with:" ? 2 : 1;
    if (args.length !== expected) {
      return fail(context, `Message ${name} expects ${expected} argument(s).`);
    }
    const callback = args[expected - 1];
    if (callback === undefined || !isBlock(callback)) {
      return fail(context, "Block argument required.");
    }
    const snapshot = [...receiver];
    if (name === "reduce:with:") {
      let result = args[0] ?? null;
      for (const value of snapshot) {
        context.state.consume(context.location);
        result = invokeMacroBlock(callback, [result, value], context);
      }
      return result;
    }
    const result: MacroValue[] = [];
    for (const value of snapshot) {
      context.state.consume(context.location);
      const mapped = invokeMacroBlock(callback, [value], context);
      if (name === "map:") result.push(mapped);
      else if (typeof mapped !== "boolean") {
        return fail(context, "Boolean result required.");
      } else if (mapped) result.push(value);
    }
    return result;
  }
  return fail(context, `Unsupported Array message ${name}.`);
}
function isBlock(
  value: MacroValue,
): value is
  | import("./macro_value.ts").MacroBlock
  | import("./macro_value.ts").MacroNative {
  return value !== null && typeof value === "object" && "kind" in value &&
    (value.kind === "macroBlock" || value.kind === "macroNative");
}
function inspect(values: MacroValue[], context: MacroContext): string {
  const active = context.state.inspectingArrays;
  if (active.has(values)) return "[...]";
  active.add(values);
  try {
    const snapshot = [...values];
    const rendered = snapshot.map((value) => {
      const result = performMacro(value, "inspect", [], context);
      if (typeof result !== "string") {
        return fail(context, "String result required.");
      }
      return result;
    });
    return `[${rendered.join(", ")}]`;
  } finally {
    active.delete(values);
  }
}
