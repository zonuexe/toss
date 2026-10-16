export const blockValue = {
  name: "value",
  javascript: `function value(receiver, context) {
  return invokeBlock(receiver, [], context);
}`,
} as const;

export const blockValueWithArguments = {
  selectorPattern: "^(?:value:)+$",
  javascript: `function valueWithArguments(receiver, context, ...args) {
  return invokeBlock(receiver, args, context);
}`,
} as const;
