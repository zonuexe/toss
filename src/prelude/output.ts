export const outputPrint = {
  name: "print",
  javascript: `function print(receiver, context) {
  return writeOutput(receiver, "toString", context);
}`,
} as const;

export const outputDump = {
  name: "dump",
  javascript: `function dump(receiver, context) {
  return writeOutput(receiver, "inspect", context);
}`,
} as const;
