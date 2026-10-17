export type ArithmeticOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "<"
  | "<="
  | ">"
  | ">="
  | "=="
  | "!=";

export type ComparisonOperator = Exclude<
  ArithmeticOperator,
  "+" | "-" | "*" | "/" | "%"
>;

const operators = [
  "<=",
  ">=",
  "==",
  "!=",
  "<",
  ">",
] as const;

export function comparisonOperatorAt(
  source: string,
  offset: number,
): ComparisonOperator | undefined {
  return operators.find((operator) => source.startsWith(operator, offset));
}
