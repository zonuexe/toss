import type { Expression } from "./ast.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { parseExtend } from "./extend_parser.ts";
import { lex, type Token } from "./lexer.ts";
import { parseJavaScriptBindings } from "./javascript_bindings.ts";
import { tokensFromSyntax } from "./syntax_tokens.ts";
import { syntaxGroup } from "./syntax.ts";
import { parsePrimary } from "./parser_primary.ts";

export function parse(source: string, file: string): readonly Expression[] {
  const { tokens, end } = lex(source, file);
  return parseTokens(tokens, end, file);
}

export function parseTokens(
  tokens: readonly Token[],
  end: Token,
  file: string,
): readonly Expression[] {
  let index = 0;
  const current = (): Token => tokens[index] ?? end;
  const advance = (): Token => {
    const token = current();
    index++;
    return token;
  };
  const expressions: Expression[] = [];

  function primary(): Expression {
    return parsePrimary({
      current,
      advance,
      pipeline,
      parseJavaScript: (token) =>
        parseJavaScriptBindings(token, file, {
          parseText: (text) => parse(text, file),
          parseSyntax: (nodes) => {
            const first = nodes[0];
            const location = first?.origin.location ?? token.location;
            const origin = first?.origin ?? {
              location,
              scope: token.location.scope ?? { kind: "caller", id: 0 },
              trace: token.location.trace ?? [],
            };
            const converted = tokensFromSyntax(syntaxGroup("", nodes, origin));
            return parseTokens(
              [...converted.tokens, { kind: "period", location }],
              converted.end,
              file,
            );
          },
        }),
    });
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
          case "quotation":
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
