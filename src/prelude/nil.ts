export const nilToString = {
  name: "toString",
  javascript: `function nilToString() { return "nil"; }`,
} as const;

export const nilInspect = {
  name: "inspect",
  javascript: `function nilInspect() { return "nil"; }`,
} as const;
