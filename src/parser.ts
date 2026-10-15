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
      case "openBrace": {
        let parameters: readonly [] | readonly [string] = [];
        const parameter = current();
        if (parameter.kind === "unary") {
          parameters = [parameter.name];
          index++;
          if (current().kind !== "arrow") {
            throw new TossSyntaxError(
              current().location,
              "Expected '->' after block parameter.",
            );
          }
          index++;
        }
        const first = pipeline();
        const rest: Expression[] = [];
        while (current().kind === "period") {
          index++;
          if (current().kind === "closeBrace") break;
          rest.push(pipeline());
        }
        if (current().kind !== "closeBrace") {
          throw new TossSyntaxError(
            current().location,
            "Expected '}' after block body.",
          );
        }
        index++;
        return {
          kind: "block",
          parameters,
          body: [first, ...rest],
          location: token.location,
        };
      }
      case "openParen": {
        const expression = pipeline();
        if (current().kind !== "closeParen") {
          throw new TossSyntaxError(
            current().location,
            "Expected ')' after grouped expression.",
          );
        }
        index++;
        return expression;
      }
      case "unary":
      case "keyword":
      case "period":
      case "pipe":
      case "closeParen":
      case "closeBrace":
      case "arrow":
      case "eof":
        throw new TossSyntaxError(
          token.location,
          "Expected an expression.",
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

  function keyword(input?: Expression): Expression {
    const receiver = unary();
    const location = current().location;
    let name = "";
    const args: Expression[] = [];
    let token = current();
    while (token.kind === "keyword") {
      name += token.name;
      index++;
      const following = current();
      if (input !== undefined) {
        switch (following.kind) {
          case "period":
          case "closeParen":
          case "closeBrace":
          case "pipe":
          case "eof":
            return {
              kind: "pipeline",
              input,
              receiver,
              name,
              arguments: args,
              location,
            };
          case "string":
          case "symbol":
          case "fetch":
          case "unary":
          case "keyword":
          case "openParen":
          case "openBrace":
          case "arrow":
            break;
          default: {
            const exhaustive: never = following;
            throw new TypeError(
              `Unexpected token: ${JSON.stringify(exhaustive)}`,
            );
          }
        }
      }
      args.push(unary());
      token = current();
    }
    if (input !== undefined) {
      throw new TossSyntaxError(
        current().location,
        "Expected a keyword message with its final argument omitted after '|>'.",
      );
    }
    return args.length === 0
      ? receiver
      : { kind: "send", receiver, name, arguments: args, location };
  }

  function pipeline(): Expression {
    let expression = keyword();
    while (current().kind === "pipe") {
      index++;
      expression = keyword(expression);
    }
    return expression;
  }

  while (current().kind !== "eof") {
    expressions.push(pipeline());
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
