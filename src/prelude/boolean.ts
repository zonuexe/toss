import { outputDump, outputPrint } from "./output.ts";

export const booleanMessages = [
  {
    name: "ifTrue:",
    javascript: `function ifTrue(receiver, context, block) {
  const selected = blockArgument(block, context);
  return receiver ? invokeBlock(selected, [], context) : null;
}`,
  },
  {
    name: "ifFalse:",
    javascript: `function ifFalse(receiver, context, block) {
  const selected = blockArgument(block, context);
  return receiver ? null : invokeBlock(selected, [], context);
}`,
  },
  {
    name: "ifTrue:ifFalse:",
    javascript:
      `function ifTrueIfFalse(receiver, context, trueBlock, falseBlock) {
  const selectedTrue = blockArgument(trueBlock, context);
  const selectedFalse = blockArgument(falseBlock, context);
  return invokeBlock(receiver ? selectedTrue : selectedFalse, [], context);
}`,
  },
  {
    name: "toString",
    javascript: "function toString(receiver) { return String(receiver); }",
  },
  {
    name: "inspect",
    javascript: "function inspect(receiver) { return String(receiver); }",
  },
  outputPrint,
  outputDump,
  { name: "not", javascript: "function not(receiver) { return !receiver; }" },
] as const;
