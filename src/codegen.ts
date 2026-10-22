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
import {
  symbolBind,
  symbolEquals,
  symbolGenerateUnique,
  symbolInspect,
  symbolToString,
} from "./prelude/symbol.ts";
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
      }) {\nconst invocation = this;\nconst scope = {bindings: new Map(), parent: captured, superContext: invocation?.kind === "tossInvocation" ? invocation.context : captured.superContext};\nif (invocation?.kind === "tossInvocation") scope.bindings.set(Symbol.for("self"), invocation.context.receiver);\n${
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
    case "import":
      return `initializeModule(moduleImports.get(${
        JSON.stringify(expression.path)
      }), ${context}.location)`;
    case "export":
      return `(moduleExport = ${emit(expression.value, scope)})`;
    case "javascript":
      return `evaluateJavaScript(${JSON.stringify(expression.source)}, [${
        expression.bindings.map((binding) => emit(binding.value, scope)).join(
          ", ",
        )
      }], ${context}, ${
        JSON.stringify(expression.bindings.map((binding) => binding.name))
      })`;
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
    case "super":
      return `parentSend([${
        expression.arguments.map((argument) => emit(argument, scope)).join(", ")
      }], ${context}, ${scope})`;
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
        `if (extendTarget === null || typeof extendTarget !== "object" || Array.isArray(extendTarget) || isJavaScriptReference(extendTarget)) throw new TossRuntimeError("%extend target must be an Object.", ${context}.location);`,
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

function runtimePreludeLines(): string[] {
  return [
    '"use strict";',
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
      symbolEquals,
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
  ];
}

function fileRootSetupLines(imports: readonly string[] = []): string[] {
  return [
    "const environment = {bindings: new Map(), parent: null};",
    "let moduleExport = null;",
    `const moduleImports = new Map([${imports.join(", ")}]);`,
    "const objectRoot = Object.create(null);",
    'environment.bindings.set(Symbol.for("Object"), objectRoot);',
    "const symbolRoot = Object.create(null);",
    `Object.defineProperty(symbolRoot, "generateUnique", {value: ${symbolGenerateUnique}, writable: true, enumerable: true, configurable: true});`,
    'environment.bindings.set(Symbol.for("Symbol"), symbolRoot);',
    'environment.bindings.set(Symbol.for("Nil"), null);',
    'environment.bindings.set(Symbol.for("True"), true);',
    'environment.bindings.set(Symbol.for("False"), false);',
  ];
}

export function generate(expressions: readonly Expression[]): string {
  const lines = [...runtimePreludeLines(), ...fileRootSetupLines()];
  for (const expression of expressions) lines.push(emit(expression) + ";");
  return lines.join("\n") + "\n";
}

export type BundleModule = {
  readonly expressions: readonly Expression[];
  readonly imports: readonly { readonly path: string; readonly id: number }[];
};

export function generateBundle(
  modules: readonly BundleModule[],
  entry: number,
): string {
  const lines = [
    ...runtimePreludeLines(),
    "const moduleInitializers = [];",
    "const moduleStates = new Map();",
  ];
  modules.forEach((module, id) => {
    const imports = module.imports.map(({ path, id: dependency }) =>
      `[${JSON.stringify(path)}, ${dependency}]`
    );
    const statements = module.expressions.map((expression) =>
      `${emit(expression)};`
    );
    lines.push(`moduleInitializers[${id}] = function() {`);
    lines.push(...fileRootSetupLines(imports));
    lines.push(...statements, "return moduleExport;", "};");
  });
  lines.push("function initializeModule(id, location) {");
  lines.push("const previous = moduleStates.get(id);");
  lines.push("if (previous?.state === 'done') return previous.value;");
  lines.push("if (previous?.state === 'failed') throw previous.error;");
  lines.push(
    "if (previous?.state === 'running') throw new TossRuntimeError('Module initialization re-entered.', location);",
  );
  lines.push("moduleStates.set(id, {state: 'running'});");
  lines.push(
    "try { const value = moduleInitializers[id](); moduleStates.set(id, {state: 'done', value}); return value; }",
  );
  lines.push(
    "catch (error) { moduleStates.set(id, {state: 'failed', error}); throw error; }",
  );
  lines.push("}");
  lines.push(
    `initializeModule(${entry}, {file: "<entry>", line: 1, column: 1});`,
  );
  return lines.join("\n") + "\n";
}
