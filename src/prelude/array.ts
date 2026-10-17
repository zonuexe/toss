export const arrayMessages = [
  {
    name: "length",
    javascript: "function length(receiver) { return receiver.length; }",
  },
  {
    name: "at:",
    javascript: `function at(receiver, context, index) {
  arrayIndex(receiver, index, context);
  return receiver[index];
}`,
  },
  {
    name: "at:put:",
    javascript: `function atPut(receiver, context, index, value) {
  arrayIndex(receiver, index, context);
  receiver[index] = value;
  return value;
}`,
  },
] as const;
