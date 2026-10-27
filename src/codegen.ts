import type { Expression } from "./ast.ts";
import {
  compileFormat,
  type CompileOptions,
  compileRuntimeImport,
  compileTreeShakePrelude,
} from "./compile_options.ts";
import { createEmitter } from "./codegen_expression.ts";
import { fileRootSetupLines, runtimePreludeLines } from "./codegen_prelude.ts";
import {
  collectJavaScriptExpressions,
  emitJavaScriptEvaluators,
  javascriptImportAliases,
  javascriptRuntimeAlias,
} from "./codegen_javascript.ts";
import { collectJavaScriptImports } from "./javascript_import_analysis.ts";
import { collectPreludeSelectors } from "./prelude_analysis.ts";
import { runtimeCompatibilitySetupLines } from "./runtime_module.ts";
import {
  emitJavaScriptImportStatements,
  javascriptImportMapExpression,
} from "./javascript_import_codegen.ts";

export {
  type BundleModule,
  generateBundle,
  generateFragment,
  generateModuleInitializer,
  moduleRuntimeLines,
} from "./codegen_bundle.ts";

export function generate(
  expressions: readonly Expression[],
  options: CompileOptions = {},
): string {
  const format = compileFormat(options);
  const runtimeImport = compileRuntimeImport(options);
  const treeShakePrelude = compileTreeShakePrelude(options);
  const javascriptExpressions = collectJavaScriptExpressions(expressions);
  const javascriptState = emitJavaScriptEvaluators(javascriptExpressions);
  const imports = collectJavaScriptImports(expressions);
  const importAliases = javascriptImportAliases(imports, javascriptExpressions);
  const runtimeAlias = runtimeImport === undefined
    ? undefined
    : javascriptRuntimeAlias(javascriptExpressions);
  const evaluatorIndices = new Map<Expression, number>(
    javascriptExpressions.map((expression, index) => [expression, index]),
  );
  const runtimeSetup = runtimeAlias === undefined
    ? runtimePreludeLines(
      false,
      treeShakePrelude ? collectPreludeSelectors(expressions) : undefined,
    )
    : runtimeCompatibilitySetupLines("runtimeNamespace");
  const emit = createEmitter(evaluatorIndices);
  const lines = [
    ...emitJavaScriptImportStatements(imports, importAliases),
    ...(runtimeImport === undefined || runtimeAlias === undefined ? [] : [
      `import * as ${runtimeAlias} from ${JSON.stringify(runtimeImport)};`,
    ]),
    `${
      format === "esm" ? "export default " : ""
    }((javascriptEvaluators, javascriptImportNames${
      runtimeImport === undefined ? "" : ", runtimeNamespace"
    }) => {`,
    ...runtimeSetup,
    ...fileRootSetupLines(),
  ];
  for (const expression of expressions) lines.push(emit(expression) + ";");
  if (format === "esm") {
    const exported = expressions.find((expression) =>
      expression.kind === "export"
    );
    if (exported === undefined) {
      throw new TypeError(
        "ES module generation requires an export expression.",
      );
    }
    lines.push(
      `return toJavaScript(moduleExport, {location: ${
        JSON.stringify(exported.location)
      }});`,
    );
  }
  lines.push(
    `})(${javascriptState.source}, ${
      javascriptImportMapExpression(imports, importAliases)
    }${runtimeAlias === undefined ? "" : `, ${runtimeAlias}`});`,
  );
  return lines.join("\n") + "\n";
}
