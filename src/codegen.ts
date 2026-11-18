import type { Expression } from "./ast.ts";
import {
  compileFailureObserverImport,
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
  const observerImport = compileFailureObserverImport(options);
  const treeShakePrelude = compileTreeShakePrelude(options);
  const javascriptExpressions = collectJavaScriptExpressions(expressions);
  const javascriptState = emitJavaScriptEvaluators(javascriptExpressions);
  const imports = collectJavaScriptImports(expressions);
  const hostImports = observerImport === undefined
    ? imports
    : [...imports, observerImport];
  const importAliases = javascriptImportAliases(
    hostImports,
    javascriptExpressions,
  );
  const observerAlias = observerImport === undefined
    ? undefined
    : importAliases[imports.length];
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
      undefined,
      observerAlias !== undefined,
    )
    : runtimeCompatibilitySetupLines(
      "runtimeNamespace",
      undefined,
      observerAlias === undefined ? "undefined" : "effectDiagnosticHost",
    );
  const emit = createEmitter(evaluatorIndices);
  const lines = [
    ...emitJavaScriptImportStatements(hostImports, importAliases),
    ...(runtimeImport === undefined || runtimeAlias === undefined ? [] : [
      `import * as ${runtimeAlias} from ${JSON.stringify(runtimeImport)};`,
    ]),
    `${
      format === "esm" ? "export default " : ""
    }((javascriptEvaluators, javascriptImportNames${
      observerAlias === undefined ? "" : ", effectDiagnosticHost"
    }${runtimeImport === undefined ? "" : ", runtimeNamespace"}) => {`,
    ...runtimeSetup,
    ...fileRootSetupLines(),
  ];
  if (observerAlias !== undefined) lines.push("try {");
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
  if (observerAlias !== undefined) {
    lines.push("} catch (error) { throw reportHostFailure(error, 'entry'); }");
  }
  lines.push(
    `})(${javascriptState.source}, ${
      javascriptImportMapExpression(imports, importAliases)
    }${observerAlias === undefined ? "" : `, ${observerAlias}`}${
      runtimeAlias === undefined ? "" : `, ${runtimeAlias}`
    });`,
  );
  return lines.join("\n") + "\n";
}
