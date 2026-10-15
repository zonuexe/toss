export const stringToString = {
  name: "toString",
  javascript: `function toString(receiver) {
  return receiver;
}`,
} as const;

export const stringInspect = {
  name: "inspect",
  javascript: `function inspect(receiver) {
  return JSON.stringify(receiver);
}`,
} as const;
