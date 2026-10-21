import type { Expression } from "./ast.ts";
import { blockValue, blockValueWithArguments } from "./prelude/block.ts";
import { outputDump, outputPrint } from "./prelude/output.ts";
import { stringInspect, stringToString } from "./prelude/string.ts";
import {
  objectAt,
  objectAtPut,
  objectClone,
  objectPerform,
  objectPerformWithArguments,
} from "./prelude/object.ts";
import { symbolBind, symbolInspect, symbolToString } from "./prelude/symbol.ts";
import { nilInspect, nilToString } from "./prelude/nil.ts";
import { numberMessages } from "./prelude/number.ts";
import { booleanMessages } from "./prelude/boolean.ts";
import { arrayMessages } from "./prelude/array.ts";
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

function emit(expression: Expression, scope = "environment"): string {
  const context = `{location: ${
    JSON.stringify(expression.location)
  }, environment: ${scope}}`;
  switch (expression.kind) {
    case "block": {
      const parameters = expression.parameters.map((_, index) => `arg${index}`);
      const bindings = expression.parameters.map((name, index) =>
        `scope.bindings.set(Symbol.for(${JSON.stringify(name)}), arg${index});`
      );
      const body = expression.body.map((item, index) =>
        `${index === expression.body.length - 1 ? "return " : ""}${
          emit(item, "scope")
        };`
      );
      return `((captured) => function(${
        parameters.join(", ")
      }) {\nconst scope = {bindings: new Map(), parent: captured};\nif (this !== undefined) scope.bindings.set(Symbol.for("self"), this);\n${
        [...bindings, ...(body.length === 0 ? ["return null;"] : body)].join(
          "\n",
        )
      }\n})(${scope})`;
    }
    case "string":
      return JSON.stringify(expression.value);
    case "number":
      return Object.is(expression.value, -0) ? "-0" : String(expression.value);
    case "symbol":
      return `Symbol.for(${JSON.stringify(expression.name)})`;
    case "fetch":
      return `fetchBinding(${JSON.stringify(expression.name)}, ${context})`;
    case "array":
      return `[${
        expression.elements.map((item) => emit(item, scope)).join(", ")
      }]`;
    case "send":
      return `send(${emit(expression.receiver, scope)}, {name: ${
        JSON.stringify(expression.name)
      }, arguments: [${
        expression.arguments.map((argument) => emit(argument, scope)).join(", ")
      }]}, ${context})`;
    case "pipeline":
      return `((piped) => send(${emit(expression.receiver, scope)}, {name: ${
        JSON.stringify(expression.name)
      }, arguments: [${
        [
          ...expression.arguments.map((argument) => emit(argument, scope)),
          "piped",
        ].join(", ")
      }]}, ${context}))(${emit(expression.input, scope)})`;
    case "extend": {
      const entries = expression.entries.map((entry) =>
        `send(extendTarget, {name: "at:put:", arguments: [${
          emit(entry.key, scope)
        }, ${emit(entry.value, scope)}]}, {location: ${
          JSON.stringify(entry.location)
        }, environment: ${scope}});`
      );
      const body = [
        `if (extendTarget === null || typeof extendTarget !== "object" || Array.isArray(extendTarget)) throw new TossRuntimeError("%extend target must be an Object.", ${context}.location);`,
        ...entries,
        "return extendTarget;",
      ].join("\n");
      return `((extendTarget) => {\n${body}\n})(${
        emit(expression.input, scope)
      })`;
    }
    default: {
      const exhaustive: never = expression;
      throw new TypeError(
        `Unexpected expression: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

export function generate(expressions: readonly Expression[]): string {
  const lines = [
    '"use strict";',
    "const environment = {bindings: new Map(), parent: null};",
    messageTable("blockMessages", [blockValue]),
    `const blockKeywordSelector = new RegExp(${
      JSON.stringify(blockValueWithArguments.selectorPattern)
    });`,
    `const blockKeywordMessage = ${blockValueWithArguments.javascript};`,
    messageTable("stringMessages", [
      stringToString,
      stringInspect,
      outputPrint,
      outputDump,
    ]),
    messageTable("numberMessages", numberMessages),
    messageTable("booleanMessages", booleanMessages),
    messageTable("arrayMessages", arrayMessages),
    messageTable("symbolMessages", [
      symbolToString,
      symbolInspect,
      outputPrint,
      outputDump,
      symbolBind,
    ]),
    messageTable("nilMessages", [
      nilToString,
      nilInspect,
      outputPrint,
      outputDump,
    ]),
    messageTable("objectMessages", [
      objectClone,
      objectAt,
      objectAtPut,
      objectPerform,
      objectPerformWithArguments,
      outputPrint,
      outputDump,
    ]),
    runtimeJavaScript,
    "const objectRoot = Object.create(null);",
    'environment.bindings.set(Symbol.for("Object"), objectRoot);',
    'environment.bindings.set(Symbol.for("Nil"), null);',
    'environment.bindings.set(Symbol.for("True"), true);',
    'environment.bindings.set(Symbol.for("False"), false);',
  ];
  for (const expression of expressions) lines.push(emit(expression) + ";");
  return lines.join("\n") + "\n";
}
