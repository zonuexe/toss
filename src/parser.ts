import type { Expression } from "./ast.ts";
import { parseArithmeticBody } from "./arithmetic_parser.ts";
import { parseBlock } from "./block_parser.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { parseExtend } from "./extend_parser.ts";
import { parseExport, parseImport } from "./module_parser.ts";
import { lex, type Token } from "./lexer.ts";
import { parseJavaScriptBindings } from "./javascript_bindings.ts";

export function parse(source: string, file: string): readonly Expression[] {
  const { tokens, end } = lex(source, file);
  let index = 0;
  const current = (): Token => tokens[index] ?? end;
  const advance = (): Token => {
    const token = current();
    index++;
    return token;
  };
  const expressions: Expression[] = [];

  function primary(): Expression {
    const token = current();
    index++;
    switch (token.kind) {
      case "importOpen": {
        return parseImport({ current, advance }, token.location);
      }
      case "exportOpen": {
        return parseExport({ current, advance, pipeline }, token.location);
      }
      case "javascript":
        return parseJavaScriptBindings(
          token,
          file,
          (text) => parse(text, file),
        );
      case "arithmeticOpen":
        return parseArithmeticBody({ current, advance });
      case "superOpen": {
        const args: Expression[] = [];
        if (current().kind !== "closeParen") {
          args.push(pipeline());
          while (current().kind === "comma") {
            index++;
            if (current().kind === "closeParen") {
              throw new TossSyntaxError(
                current().location,
                "Expected an expression after ','.",
              );
            }
            args.push(pipeline());
          }
        }
        if (current().kind !== "closeParen") {
          throw new TossSyntaxError(
            current().location,
            "Expected ')' after %super arguments.",
          );
        }
        index++;
        return { kind: "super", arguments: args, location: token.location };
      }
      case "number":
        return { kind: "number", value: token.value, location: token.location };
      case "string":
        return { kind: "string", value: token.value, location: token.location };
      case "symbol":
        return { kind: "symbol", name: token.name, location: token.location };
      case "fetch":
        return { kind: "fetch", name: token.name, location: token.location };
      case "openBracket": {
        const elements: Expression[] = [];
        if (current().kind !== "closeBracket") {
          elements.push(pipeline());
          while (current().kind === "comma") {
            index++;
            if (current().kind === "closeBracket") {
              throw new TossSyntaxError(
                current().location,
                "Expected an expression after ','.",
              );
            }
            elements.push(pipeline());
          }
        }
        if (current().kind !== "closeBracket") {
          throw new TossSyntaxError(
            current().location,
            "Expected ']' after array elements.",
          );
        }
        index++;
        return { kind: "array", elements, location: token.location };
      }
      case "openBrace": {
        return parseBlock({ current, advance, pipeline }, token.location);
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
      case "arithmeticClose":
      case "arithmeticOperator":
      case "extendOpen":
      case "unary":
      case "keyword":
      case "period":
      case "pipe":
      case "closeParen":
      case "closeBrace":
      case "closeBracket":
      case "arrow":
      case "comma":
      case "colon":
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
          case "closeBracket":
          case "comma":
          case "colon":
          case "pipe":
          case "arithmeticClose":
          case "arithmeticOperator":
          case "extendOpen":
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
          case "number":
          case "symbol":
          case "fetch":
          case "unary":
          case "keyword":
          case "openParen":
          case "arithmeticOpen":
          case "openBrace":
          case "openBracket":
          case "arrow":
          case "superOpen":
          case "importOpen":
          case "exportOpen":
          case "javascript":
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
      if (current().kind === "extendOpen") {
        const location = current().location;
        index++;
        expression = parseExtend(
          { current, advance, pipeline },
          expression,
          location,
        );
      } else {
        expression = keyword(expression);
      }
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
