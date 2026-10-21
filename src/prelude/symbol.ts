export const symbolToString = {
  name: "toString",
  javascript: `function toString(receiver) {
  return Symbol.keyFor(receiver) ?? "<unique>";
}`,
} as const;

export const symbolInspect = {
  name: "inspect",
  javascript: `function inspect(receiver) {
  return Symbol.keyFor(receiver) === undefined ? "#<unique>" : "#" + Symbol.keyFor(receiver);
}`,
} as const;

export const symbolGenerateUnique = `function generateUnique() {
  return Symbol();
}`;

export const symbolBind = {
  name: "bind:",
  javascript: `function bind(receiver, context, value) {
  context.environment.bindings.set(receiver, value);
  return value;
}`,
} as const;
