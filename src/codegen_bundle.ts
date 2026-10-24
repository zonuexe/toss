import type { Expression } from "./ast.ts";
import { createEmitter } from "./codegen_expression.ts";
import { collectJavaScriptImports } from "./javascript_import_analysis.ts";
import {
  collectJavaScriptExpressions,
  emitJavaScriptEvaluators,
  javascriptImportAliases,
} from "./codegen_javascript.ts";
import {
  emitJavaScriptImportStatements,
  javascriptImportMapExpression,
} from "./javascript_import_codegen.ts";
import { compileFormat, type CompileOptions } from "./compile_options.ts";
import { fileRootSetupLines, runtimePreludeLines } from "./codegen_prelude.ts";

export type BundleModule = {
  readonly expressions: readonly Expression[];
  readonly imports: readonly { readonly path: string; readonly id: number }[];
};

export function generateFragment(
  expressions: readonly Expression[],
  imports?: readonly { readonly path: string; readonly id: number }[],
): string {
  const previous = expressions.slice(0, -1).map((expression) =>
    createEmitter()(expression) + ";"
  );
  const final = expressions.at(-1);
  if (final === undefined) return "";
  const body = `\n${previous.join("\n")}\nreturn ${createEmitter()(final)};\n`;
  if (imports === undefined) return `(function(){${body}})()`;
  const entries = imports.map(({ path, id }) =>
    `[${JSON.stringify(path)}, ${id}]`
  ).join(", ");
  return `((moduleImports) => {${body}})(new Map([${entries}]))`;
}

export function generateModuleInitializer(
  module: BundleModule,
  evaluators?: ReadonlyMap<Expression, number>,
): string {
  const emit = createEmitter(evaluators);
  const imports = module.imports.map(({ path, id }) =>
    `[${JSON.stringify(path)}, ${id}]`
  );
  const statements = module.expressions.map((expression) =>
    `${emit(expression)};`
  );
  return `() => {\n${fileRootSetupLines(imports).join("\n")}\n${
    statements.join("\n")
  }\nreturn moduleExport;\n}`;
}

export function moduleRuntimeLines(): string[] {
  return [
    "const moduleInitializers = [];",
    "const moduleStates = new Map();",
    "function initializeModule(id, location) {",
    "const previous = moduleStates.get(id);",
    "if (previous?.state === 'done') return previous.value;",
    "if (previous?.state === 'failed') throw previous.error;",
    "if (previous?.state === 'running') throw new TossRuntimeError('Module initialization re-entered.', location);",
    "moduleStates.set(id, {state: 'running'});",
    "try { const value = moduleInitializers[id](); moduleStates.set(id, {state: 'done', value}); return value; }",
    "catch (error) { moduleStates.set(id, {state: 'failed', error}); throw error; }",
    "}",
  ];
}

export function generateBundle(
  modules: readonly BundleModule[],
  entry: number,
  options: CompileOptions = {},
): string {
  const format = compileFormat(options);
  const expressions = modules.flatMap((module) => module.expressions);
  const javascriptExpressions = collectJavaScriptExpressions(expressions);
  const javascriptState = emitJavaScriptEvaluators(javascriptExpressions);
  const imports = collectJavaScriptImports(expressions);
  const importAliases = javascriptImportAliases(imports, javascriptExpressions);
  const evaluatorIndices = new Map<Expression, number>(
    javascriptExpressions.map((expression, index) => [expression, index]),
  );
  const exported = modules[entry]?.expressions.find((expression) =>
    expression.kind === "export"
  );
  const lines = [
    ...emitJavaScriptImportStatements(imports, importAliases),
    `${
      format === "esm" ? "export default " : ""
    }((javascriptEvaluators, javascriptImportNames) => {`,
    ...runtimePreludeLines(),
    ...moduleRuntimeLines(),
  ];
  modules.forEach((module, id) => {
    lines.push(
      `moduleInitializers[${id}] = ${
        generateModuleInitializer(module, evaluatorIndices)
      };`,
    );
  });
  if (format === "esm" && exported === undefined) {
    throw new TypeError("ES module generation requires an export expression.");
  }
  lines.push(
    format === "esm"
      ? `const __tossDefaultExport = initializeModule(${entry}, {file: "<entry>", line: 1, column: 1});\nreturn toJavaScript(__tossDefaultExport, {location: ${
        JSON.stringify(exported?.location)
      }});`
      : `initializeModule(${entry}, {file: "<entry>", line: 1, column: 1});`,
  );
  lines.push(
    `})(${javascriptState.source}, ${
      javascriptImportMapExpression(imports, importAliases)
    });`,
  );
  return lines.join("\n") + "\n";
}
