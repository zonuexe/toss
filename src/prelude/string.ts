export const stringPrint = {
  name: "print",
  javascript: `function print(receiver) {
  console.log(receiver);
  return receiver;
}`,
} as const;
