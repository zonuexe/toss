import { outputDump, outputPrint } from "./output.ts";

const binary = (name: string, expression: string) => ({
  name,
  javascript: `function ${
    name.replaceAll(":", "")
  }(receiver, context, argument) {
  const numericArgument = numberArgument(argument, context);
  return ${expression.replaceAll("argument", "numericArgument")};
}`,
});

const divide = (name: "divideBy:" | "remainder:", operator: "/" | "%") => ({
  name,
  javascript: `function ${
    name.replaceAll(":", "")
  }(receiver, context, argument) {
  const numericArgument = numberArgument(argument, context);
  if (numericArgument === 0) {
    throw new TossRuntimeError("${
    operator === "/" ? "Division" : "Remainder"
  } by zero.", context.location);
  }
  return finiteNumber(receiver ${operator} numericArgument, context);
}`,
});

export const numberMessages = [
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
  binary("add:", "finiteNumber(receiver + argument, context)"),
  binary("subtract:", "finiteNumber(receiver - argument, context)"),
  binary("multiplyBy:", "finiteNumber(receiver * argument, context)"),
  divide("divideBy:", "/"),
  divide("remainder:", "%"),
  {
    name: "negated",
    javascript:
      "function negated(receiver, context) { return finiteNumber(-receiver, context); }",
  },
  binary("equals:", "receiver === argument"),
  binary("lessThan:", "receiver < argument"),
  binary("greaterThan:", "receiver > argument"),
  binary("lessThanOrEqual:", "receiver <= argument"),
  binary("greaterThanOrEqual:", "receiver >= argument"),
] as const;
