export const blockValue = {
  name: "value",
  javascript: `function value(receiver, context) {
  return invokeBlock(receiver, [], context);
}`,
} as const;

export const blockValueWithArgument = {
  name: "value:",
  javascript: `function value(receiver, context, argument) {
  return invokeBlock(receiver, [argument], context);
}`,
} as const;
