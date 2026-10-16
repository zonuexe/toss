import { outputDump, outputPrint } from "./output.ts";

export const booleanMessages = [
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
