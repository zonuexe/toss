import type { Expression } from "./ast.ts";
import { emitBlock } from "./codegen_block.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { collectJavaScriptImports } from "./javascript_import_analysis.ts";
import { emitJavaScriptImports } from "./javascript_import_codegen.ts";
import { containsDirectAwait } from "./codegen_analysis.ts";
import { fileRootSetupLines, runtimePreludeLines } from "./codegen_prelude.ts";

function emit(expression: Expression, scope = "environment"): string {
  const context = `{location: ${
    JSON.stringify(expression.location)
  }, environment: ${scope}}`;
  switch (expression.kind) {
    case "block": {
      return emitBlock(expression, scope, emit);
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
    case "javascriptImport": {
      const specifier = JSON.stringify(expression.specifier);
      return `fromJavaScript(javascriptImportNames.get(${specifier}), ${context})`;
    }
    case "export":
      return `(moduleExport = ${emit(expression.value, scope)})`;
    case "await":
      return `(await awaitToss(${
        emit(expression.expression, scope)
      }, ${context})).value`;
    case "javascript":
      return `evaluateJavaScript(${JSON.stringify(expression.source)}, [${
        expression.bindings.map((binding) => emit(binding.value, scope)).join(
          ", ",
        )
      }], ${context}, ${
        JSON.stringify(expression.bindings.map((binding) => binding.name))
      })`;
    case "quotation":
      throw new TossSyntaxError(
        expression.location,
        "Quotation reached runtime code generation.",
      );
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
      return `pipelineSend(${emit(expression.input, scope)})(${
        emit(
          expression.receiver,
          scope,
        )
      }, {name: ${JSON.stringify(expression.name)}, arguments: [${
        expression.arguments.map((argument) => emit(argument, scope)).join(", ")
      }]}, ${context})`;
    case "extend": {
      const entries = expression.entries.map((entry) =>
        `send(extendTarget, {name: "at:put:", arguments: [${
          emit(entry.key, scope)
        }, ${emit(entry.value, scope)}]}, {location: ${
          JSON.stringify(entry.location)
        }, environment: ${scope}});`
      );
      const asynchronous = expression.entries.some((entry) =>
        containsDirectAwait(entry.key) || containsDirectAwait(entry.value)
      );
      const body = [
        `if (extendTarget === null || typeof extendTarget !== "object" || Array.isArray(extendTarget) || isJavaScriptReference(extendTarget)) throw new TossRuntimeError("%extend target must be an Object.", ${context}.location);`,
        ...entries,
        asynchronous ? "return {value: extendTarget};" : "return extendTarget;",
      ].join("\n");
      if (asynchronous) {
        return `(await (async (extendTarget) => {\n${body}\n})(${
          emit(expression.input, scope)
        })).value`;
      }
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
    ...emitJavaScriptImports(collectJavaScriptImports(expressions)),
    ...runtimePreludeLines(),
    ...fileRootSetupLines(),
  ];
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
  const javascriptImports = collectJavaScriptImports(
    modules.flatMap((module) => module.expressions),
  );
  const lines = [
    ...emitJavaScriptImports(javascriptImports),
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
