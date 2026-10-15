import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { lex, type Token } from "./lexer.ts";

export function parse(source: string, file: string): readonly Expression[] {
  const { tokens, end } = lex(source, file);
  let index = 0;
  const current = (): Token => tokens[index] ?? end;
  const expressions: Expression[] = [];

  function primary(): Expression {
    const token = current();
    index++;
    switch (token.kind) {
      case "string":
        return { kind: "string", value: token.value, location: token.location };
      case "symbol":
        return { kind: "symbol", name: token.name, location: token.location };
      case "fetch":
        return { kind: "fetch", name: token.name, location: token.location };
      case "unary":
      case "keyword":
      case "period":
      case "eof":
        throw new TossSyntaxError(
          token.location,
          "Expected a string, symbol, or reference.",
        );
      default: {
        const exhaustive: never = token;
        throw new TypeError(`Unexpected token: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  function unary(): Expression {
    let expression = primary();
    let token = current();
    while (token.kind === "unary") {
      index++;
      expression = {
        kind: "send",
        receiver: expression,
        name: token.name,
        arguments: [],
        location: token.location,
      };
      token = current();
    }
    return expression;
  }

  function keyword(): Expression {
    const receiver = unary();
    const location = current().location;
    let name = "";
    const args: Expression[] = [];
    let token = current();
    while (token.kind === "keyword") {
      name += token.name;
      index++;
      args.push(unary());
      token = current();
    }
    return args.length === 0
      ? receiver
      : { kind: "send", receiver, name, arguments: args, location };
  }

  while (current().kind !== "eof") {
    expressions.push(keyword());
    if (current().kind !== "period") {
      throw new TossSyntaxError(
        current().location,
        "Expected '.' after expression.",
      );
    }
    index++;
  }
  return expressions;
}
