// Experimental vertical slice. This compiler is not part of Toss's public API.
import type { Expression } from "../src/ast.ts";
import { experimentalEffectRuntime } from "./effects-runtime.ts";
import { expandProgram } from "../src/macro_compile.ts";
import { analyzeModule } from "../src/module_analysis.ts";
import { finalizeModuleGraph } from "../src/module_graph.ts";
import { prepareVirtualSources } from "../src/source_compiler.ts";
import { experimentalEffectModuleRuntime } from "./effects-module-runtime.ts";
import { containsDirectAwait } from "../src/codegen_analysis.ts";
import {
  collectJavaScriptExpressions,
  emitJavaScriptEvaluators,
  javascriptImportAliases,
} from "../src/codegen_javascript.ts";
import { collectJavaScriptImports } from "../src/javascript_import_analysis.ts";
import {
  emitJavaScriptImportStatements,
  javascriptImportMapExpression,
} from "../src/javascript_import_codegen.ts";
import {
  fileRootSetupLines,
  runtimePreludeLines,
} from "../src/codegen_prelude.ts";

function createEffectEmitter(evaluators: ReadonlyMap<Expression, number>) {
  function emit(
    expression: Expression,
    scope = "environment",
    asynchronous = false,
  ): string {
    const context = `{location: ${
      JSON.stringify(expression.location)
    }, environment: ${scope}, boundary: ${scope}.effectBoundary ?? effectBoundary}`;
    const call = (code: string): string =>
      asynchronous ? `runEffectProgram(${code}, "Async")` : `(yield* ${code})`;
    switch (expression.kind) {
      case "string":
        return JSON.stringify(expression.value);
      case "number":
        return Object.is(expression.value, -0)
          ? "-0"
          : String(expression.value);
      case "symbol":
        return `Symbol.for(${JSON.stringify(expression.name)})`;
      case "fetch":
        return `fetchBinding(${JSON.stringify(expression.name)}, ${context})`;
      case "array":
        return `[${
          expression.elements.map((item) => emit(item, scope, asynchronous))
            .join(", ")
        }]`;
      case "block": {
        const parameters = expression.parameters.map((_, index) =>
          `arg${index}`
        );
        const locations = expression.parameterLocations ??
          expression.parameters.map(() => expression.location);
        const bindings = expression.parameters.map((name, index) =>
          `lexicalEnvironment(localScope, ${
            JSON.stringify(locations[index])
          }).bindings.set(Symbol.for(${JSON.stringify(name)}), arg${index});`
        );
        const blockAsync = expression.asynchronous === true;
        const body = expression.body.map((item, index) => {
          const last = index === expression.body.length - 1;
          const value = emit(item, "localScope", blockAsync);
          return last && blockAsync
            ? `return {value: ${value}};`
            : `${last ? "return " : ""}${value};`;
        });
        const scopeSetup = `
const {carrier: localScope} = blockEnvironment(captured, ${
          JSON.stringify(expression.location)
        }, ${JSON.stringify(locations)});
localScope.effectBoundary = ${
          blockAsync
            ? "asyncBoundary"
            : "invocation?.effectBoundary ?? captured.effectBoundary ?? effectBoundary"
        };
if (invocation?.kind === "tossInvocation") {
  localScope.superContext = invocation.context;
  lexicalEnvironment(localScope, ${
          JSON.stringify(expression.location)
        }).bindings.set(Symbol.for("self"), invocation.context.receiver);
}
${bindings.join("\n")}
${
          body.length === 0
            ? (blockAsync ? "return {value: null};" : "return null;")
            : body.join("\n")
        }`;
        if (blockAsync) {
          return `((captured) => markAsyncBlock(async function(${
            parameters.join(", ")
          }) {
const invocation = this;
const asyncBoundary = Object.freeze({});
try {${scopeSetup}
} catch (error) { reportEffectFailures(error); throw error; }
}))(${scope})`;
        }
        return `((captured) => markEffectBlock(function*(${
          parameters.join(", ")
        }) {
const invocation = this;${scopeSetup}
}))(${scope})`;
      }
      case "send":
        return call(
          `effectSend(${
            emit(expression.receiver, scope, asynchronous)
          }, {name: ${JSON.stringify(expression.name)}, arguments: [${
            expression.arguments.map((item) => emit(item, scope, asynchronous))
              .join(", ")
          }]}, ${context})`,
        );
      case "pipeline":
        return call(
          `effectPipeline(${emit(expression.input, scope, asynchronous)}, ${
            emit(expression.receiver, scope, asynchronous)
          }, {name: ${JSON.stringify(expression.name)}, arguments: [${
            expression.arguments.map((item) => emit(item, scope, asynchronous))
              .join(", ")
          }]}, ${context})`,
        );
      case "super":
        return call(
          `effectParent([${
            expression.arguments.map((item) => emit(item, scope, asynchronous))
              .join(", ")
          }], ${context}, ${scope})`,
        );
      case "extend": {
        const entries = expression.entries.map((entry) => {
          const operation =
            `effectSend(extendTarget, {name: "at:put:", arguments: [${
              emit(entry.key, scope, asynchronous)
            }, ${emit(entry.value, scope, asynchronous)}]}, {location: ${
              JSON.stringify(entry.location)
            }, environment: ${scope}, boundary: ${scope}.effectBoundary ?? effectBoundary})`;
          return `${call(operation)};`;
        });
        const validator =
          `if (extendTarget === null || typeof extendTarget !== "object" || Array.isArray(extendTarget) || isJavaScriptReference(extendTarget)) throw new TossRuntimeError("%extend target must be an Object.", ${context}.location);`;
        const input = emit(expression.input, scope, asynchronous);
        const innerAwait = asynchronous &&
          expression.entries.some((entry) =>
            containsDirectAwait(entry.key) || containsDirectAwait(entry.value)
          );
        if (innerAwait) {
          return `(await (async function(extendTarget) { ${validator} ${
            entries.join("\n")
          } return {value: extendTarget}; })(${input})).value`;
        }
        if (asynchronous) {
          return `(function(extendTarget) { ${validator} ${
            entries.join("\n")
          } return extendTarget; })(${input})`;
        }
        return `(yield* (function*(extendTarget) { ${validator} ${
          entries.join("\n")
        } return extendTarget; })(${input}))`;
      }
      case "import":
        return call(
          `effectInitialize(moduleImports.get(${
            JSON.stringify(expression.path)
          }), ${context}.location)`,
        );
      case "export":
        return `(moduleExport = ${
          emit(expression.value, scope, asynchronous)
        })`;
      case "javascript": {
        const index = evaluators.get(expression);
        if (index === undefined) {
          throw new TypeError("Missing JavaScript evaluator.");
        }
        return `evaluateEffectJavaScript(javascriptEvaluators[${index}], [${
          expression.bindings.map((binding) =>
            emit(binding.value, scope, asynchronous)
          ).join(", ")
        }], ${context})`;
      }
      case "await":
        if (!asynchronous) throw new TypeError("Await outside an async Block.");
        return `(await awaitToss(${
          emit(expression.expression, scope, asynchronous)
        }, ${context})).value`;
      case "javascriptImport":
        return `fromJavaScript(javascriptImportNames.get(${
          JSON.stringify(expression.specifier)
        }), ${context})`;
      case "quotation":
        throw new Error(
          `Experimental effects compiler does not support ${expression.kind}.`,
        );
      default: {
        const exhaustive: never = expression;
        throw new TypeError(JSON.stringify(exhaustive));
      }
    }
  }
  return emit;
}

export function compileExperimentalEffects(
  source: string,
  file: string,
): string {
  const expressions = expandProgram(source, { file });
  const analysis = analyzeModule(expressions, file, false);
  if (analysis.imports.length > 0) {
    throw new Error(
      "Use compileExperimentalEffectsSources for module imports.",
    );
  }
  const javascriptExpressions = collectJavaScriptExpressions(expressions);
  const javascriptState = emitJavaScriptEvaluators(javascriptExpressions);
  const imports = collectJavaScriptImports(expressions);
  const importAliases = javascriptImportAliases(imports, javascriptExpressions);
  const emit = createEffectEmitter(
    new Map(
      javascriptExpressions.map((expression, index) => [expression, index]),
    ),
  );
  const body = expressions.map((expression) => `${emit(expression)};`).join(
    "\n",
  );
  return [
    ...emitJavaScriptImportStatements(imports, importAliases),
    "((javascriptEvaluators, javascriptImportNames) => {",
    ...runtimePreludeLines(),
    ...fileRootSetupLines(),
    experimentalEffectRuntime,
    'environment.bindings.set(Symbol.for("Effect"), effectRoot);',
    "environment.effectBoundary = effectBoundary;",
    "registerEffectSymbolRoot(symbolRoot);",
    `try { runEffectProgram((function*() {\n${body}\n})()); } catch (error) { reportEffectFailures(error); throw error; }`,
    `})(${javascriptState.source}, ${
      javascriptImportMapExpression(imports, importAliases)
    });`,
  ].join("\n");
}

export function compileExperimentalEffectsSources(
  entry: string,
  sources: ReadonlyMap<string, string>,
): string {
  const { modules, edges, loadedEntry: root } = prepareVirtualSources(
    entry,
    sources,
  );
  const graph = finalizeModuleGraph(modules, root, edges);
  const javascriptExpressions = collectJavaScriptExpressions(
    graph.flatMap((module) => module.expressions),
  );
  const javascriptState = emitJavaScriptEvaluators(javascriptExpressions);
  const imports = collectJavaScriptImports(
    graph.flatMap((module) => module.expressions),
  );
  const importAliases = javascriptImportAliases(imports, javascriptExpressions);
  const emit = createEffectEmitter(
    new Map(
      javascriptExpressions.map((expression, index) => [expression, index]),
    ),
  );
  const initializers = graph.map((module, id) => {
    const body = module.expressions.map((expression) => `${emit(expression)};`)
      .join("\n");
    return `effectModuleInitializers[${id}] = function*() {\n${
      fileRootSetupLines(module.imports.map(({ path, id }) =>
        `[${JSON.stringify(path)}, ${id}]`
      )).join("\n")
    }\nenvironment.bindings.set(Symbol.for("Effect"), effectRoot);\nenvironment.effectBoundary = effectBoundary;\nregisterEffectSymbolRoot(symbolRoot);\n${body}\nreturn moduleExport;\n};`;
  });
  return [
    ...emitJavaScriptImportStatements(imports, importAliases),
    "((javascriptEvaluators, javascriptImportNames) => {",
    ...runtimePreludeLines(),
    experimentalEffectRuntime,
    experimentalEffectModuleRuntime,
    ...initializers,
    `try { runEffectProgram(effectInitialize(${root}, {file: "<entry>", line: 1, column: 1})); } catch (error) { reportEffectFailures(error); throw error; }`,
    `})(${javascriptState.source}, ${
      javascriptImportMapExpression(imports, importAliases)
    });`,
  ].join("\n");
}
