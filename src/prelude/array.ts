import { outputDump, outputPrint } from "./output.ts";

export const arrayMessages = [
  {
    name: "toString",
    javascript:
      "function toString(receiver, context) { return inspectArray(receiver, context); }",
  },
  {
    name: "inspect",
    javascript:
      "function inspect(receiver, context) { return inspectArray(receiver, context); }",
  },
  outputPrint,
  outputDump,
  {
    name: "filter:",
    javascript: `function filter(receiver, context, block) {
  const selected = blockArgument(block, context);
  const values = receiver.slice();
  const result = [];
  for (const value of values) {
    const accepted = invokeBlock(selected, [value], context);
    if (typeof accepted !== "boolean") {
      throw new TossRuntimeError("Boolean result required.", context.location);
    }
    if (accepted) result.push(value);
  }
  return result;
}`,
  },
  {
    name: "reduce:with:",
    javascript: `function reduceWith(receiver, context, initial, block) {
  const selected = blockArgument(block, context);
  const values = receiver.slice();
  let accumulator = initial;
  for (const value of values) {
    accumulator = invokeBlock(selected, [accumulator, value], context);
  }
  return accumulator;
}`,
  },
  {
    name: "map:",
    javascript: `function map(receiver, context, block) {
  const selected = blockArgument(block, context);
  const values = receiver.slice();
  const result = [];
  for (const value of values) {
    result.push(invokeBlock(selected, [value], context));
  }
  return result;
}`,
  },
  {
    name: "length",
    javascript: "function length(receiver) { return receiver.length; }",
  },
  {
    name: "at:",
    javascript: `function at(receiver, context, index) {
  arrayIndex(receiver, index, context);
  return receiver[index];
}`,
  },
  {
    name: "at:put:",
    javascript: `function atPut(receiver, context, index, value) {
  arrayIndex(receiver, index, context);
  receiver[index] = value;
  return value;
}`,
  },
] as const;
