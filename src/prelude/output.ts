export const outputPrint = {
  name: "print",
  javascript: `function print(receiver, location) {
  return writeOutput(receiver, "toString", location);
}`,
} as const;

export const outputDump = {
  name: "dump",
  javascript: `function dump(receiver, location) {
  return writeOutput(receiver, "inspect", location);
}`,
} as const;
