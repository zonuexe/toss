import type { Expression } from "./ast.ts";
import { outputDump, outputPrint } from "./prelude/output.ts";
import { stringInspect, stringToString } from "./prelude/string.ts";
import { symbolBind, symbolInspect, symbolToString } from "./prelude/symbol.ts";
import { runtimeJavaScript } from "./runtime.ts";

type PreludeMessage = { readonly name: string; readonly javascript: string };

function messageTable(
  name: string,
  messages: readonly PreludeMessage[],
): string {
  return `const ${name} = new Map([\n${
    messages.map((message) =>
      `  [${JSON.stringify(message.name)}, ${message.javascript}]`
    ).join(",\n")
  }\n]);`;
}

function emit(expression: Expression): string {
  switch (expression.kind) {
    case "string":
      return JSON.stringify(expression.value);
    case "symbol":
      return `Symbol.for(${JSON.stringify(expression.name)})`;
    case "fetch":
      return `fetchBinding(${JSON.stringify(expression.name)}, ${
        JSON.stringify(expression.location)
      })`;
    case "send":
      return `send(${emit(expression.receiver)}, {name: ${
        JSON.stringify(expression.name)
      }, arguments: [${expression.arguments.map(emit).join(", ")}]}, ${
        JSON.stringify(expression.location)
      })`;
    case "pipeline":
      return `((piped) => send(${emit(expression.receiver)}, {name: ${
        JSON.stringify(expression.name)
      }, arguments: [${
        [...expression.arguments.map(emit), "piped"].join(", ")
      }]}, ${JSON.stringify(expression.location)}))(${emit(expression.input)})`;
    default: {
      const exhaustive: never = expression;
      throw new TypeError(
        `Unexpected expression: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

export function generate(expressions: readonly Expression[]): string {
  const lines = ['"use strict";'];
  if (expressions.length > 0) {
    lines.push(
      "const environment = new Map();",
      messageTable("stringMessages", [
        stringToString,
        stringInspect,
        outputPrint,
        outputDump,
      ]),
      messageTable("symbolMessages", [
        symbolToString,
        symbolInspect,
        outputPrint,
        outputDump,
        symbolBind,
      ]),
      runtimeJavaScript,
    );
  }
  for (const expression of expressions) lines.push(emit(expression) + ";");
  return lines.join("\n") + "\n";
}
