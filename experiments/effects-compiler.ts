// Experimental vertical slice. This compiler is not part of Toss's public API.
import type { Expression } from "../src/ast.ts";
import { experimentalEffectRuntime } from "./effects-runtime.ts";
import { expandProgram, findMacroImports } from "../src/macro_compile.ts";
import { analyzeModule, type ModuleImport } from "../src/module_analysis.ts";
import { TossSyntaxError } from "../src/diagnostic.ts";
import {
  finalizeModuleGraph,
  type ModuleGraphEdge,
  normalizeVirtualSourceId,
  type ResolvedModuleGraphNode,
  resolveVirtualSourceId,
} from "../src/module_graph.ts";
import { experimentalEffectModuleRuntime } from "./effects-module-runtime.ts";
import {
  collectJavaScriptExpressions,
  emitJavaScriptEvaluators,
} from "../src/codegen_javascript.ts";
import {
  fileRootSetupLines,
  runtimePreludeLines,
} from "../src/codegen_prelude.ts";

function createEffectEmitter(evaluators: ReadonlyMap<Expression, number>) {
  function emit(expression: Expression, scope = "environment"): string {
    const context = `{location: ${
      JSON.stringify(expression.location)
    }, environment: ${scope}, boundary: ${scope}.effectBoundary ?? effectBoundary}`;
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
          expression.elements.map((item) => emit(item, scope)).join(", ")
        }]`;
      case "block": {
        if (expression.asynchronous === true) {
          throw new Error(
            "Experimental effects compiler does not support async Blocks.",
          );
        }
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
        const body = expression.body.map((item, index) =>
          `${index === expression.body.length - 1 ? "return " : ""}${
            emit(item, "localScope")
          };`
        );
        return `((captured) => markEffectBlock(function*(${
          parameters.join(", ")
        }) {
const invocation = this;
const {carrier: localScope} = blockEnvironment(captured, ${
          JSON.stringify(expression.location)
        }, ${JSON.stringify(locations)});
localScope.effectBoundary = invocation?.effectBoundary ?? captured.effectBoundary ?? effectBoundary;
if (invocation?.kind === "tossInvocation") {
  localScope.superContext = invocation.context;
  lexicalEnvironment(localScope, ${
          JSON.stringify(expression.location)
        }).bindings.set(Symbol.for("self"), invocation.context.receiver);
}
${bindings.join("\n")}
${body.length === 0 ? "return null;" : body.join("\n")}
}))(${scope})`;
      }
      case "send":
        return `(yield* effectSend(${
          emit(expression.receiver, scope)
        }, {name: ${JSON.stringify(expression.name)}, arguments: [${
          expression.arguments.map((item) => emit(item, scope)).join(", ")
        }]}, ${context}))`;
      case "pipeline":
        return `(yield* effectPipeline(${emit(expression.input, scope)}, ${
          emit(expression.receiver, scope)
        }, {name: ${JSON.stringify(expression.name)}, arguments: [${
          expression.arguments.map((item) => emit(item, scope)).join(", ")
        }]}, ${context}))`;
      case "super":
        return `(yield* effectParent([${
          expression.arguments.map((item) => emit(item, scope)).join(", ")
        }], ${context}, ${scope}))`;
      case "extend": {
        const entries = expression.entries.map((entry) =>
          `yield* effectSend(extendTarget, {name: "at:put:", arguments: [${
            emit(entry.key, scope)
          }, ${emit(entry.value, scope)}]}, {location: ${
            JSON.stringify(entry.location)
          }, environment: ${scope}, boundary: ${scope}.effectBoundary ?? effectBoundary});`
        );
        return `(yield* (function*(extendTarget) {
if (extendTarget === null || typeof extendTarget !== "object" || Array.isArray(extendTarget) || isJavaScriptReference(extendTarget)) throw new TossRuntimeError("%extend target must be an Object.", ${context}.location);
${entries.join("\n")}
return extendTarget;
})(${emit(expression.input, scope)}))`;
      }
      case "import":
        return `(yield* effectInitialize(moduleImports.get(${
          JSON.stringify(expression.path)
        }), ${context}.location))`;
      case "export":
        return `(moduleExport = ${emit(expression.value, scope)})`;
      case "javascript": {
        const index = evaluators.get(expression);
        if (index === undefined) {
          throw new TypeError("Missing JavaScript evaluator.");
        }
        return `evaluateEffectJavaScript(javascriptEvaluators[${index}], [${
          expression.bindings.map((binding) => emit(binding.value, scope)).join(
            ", ",
          )
        }], ${context})`;
      }
      case "await":
      case "javascriptImport":
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
  const emit = createEffectEmitter(
    new Map(
      javascriptExpressions.map((expression, index) => [expression, index]),
    ),
  );
  const body = expressions.map((expression) => `${emit(expression)};`).join(
    "\n",
  );
  return [
    "((javascriptEvaluators) => {",
    ...runtimePreludeLines(),
    ...fileRootSetupLines(),
    experimentalEffectRuntime,
    'environment.bindings.set(Symbol.for("Effect"), effectRoot);',
    "environment.effectBoundary = effectBoundary;",
    "registerEffectSymbolRoot(symbolRoot);",
    `try { runEffectProgram((function*() {\n${body}\n})()); } catch (error) { reportEffectFailures(error); throw error; }`,
    `})(${javascriptState.source});`,
  ].join("\n");
}

export function compileExperimentalEffectsSources(
  entry: string,
  sources: ReadonlyMap<string, string>,
): string {
  const canonicalSources = new Map<string, string>();
  for (const [path, source] of sources) {
    const id = normalizeVirtualSourceId(path);
    if (canonicalSources.has(id)) {
      throw new TypeError(`Duplicate source map path: ${JSON.stringify(id)}.`);
    }
    canonicalSources.set(id, source);
  }
  const entryId = normalizeVirtualSourceId(entry);
  if (!canonicalSources.has(entryId)) {
    throw new TypeError(
      `Entry source is not present: ${JSON.stringify(entryId)}.`,
    );
  }
  const modules: ResolvedModuleGraphNode[] = [];
  const ids = new Map<string, number>();
  const edges: ModuleGraphEdge[] = [];
  function load(
    canonical: string,
    imported: boolean,
    location?: ModuleImport["location"],
  ): number {
    const previous = ids.get(canonical);
    if (previous !== undefined) return previous;
    const source = canonicalSources.get(canonical);
    if (source === undefined) {
      if (location === undefined) throw new TypeError("Missing entry source.");
      throw new TossSyntaxError(
        location,
        `Imported file not found: ${JSON.stringify(canonical)}.`,
      );
    }
    if (findMacroImports(source, canonical).length > 0) {
      throw new Error(
        "Experimental effects compiler does not support macro imports.",
      );
    }
    const id = modules.length;
    ids.set(canonical, id);
    const expressions = expandProgram(source, { file: canonical });
    const analysis = analyzeModule(expressions, canonical, imported);
    modules.push({ expressions, imports: analysis.imports, importIds: [] });
    const importIds = analysis.imports.map((dependency) => {
      const dependencyId = resolveVirtualSourceId(
        canonical,
        dependency.path,
        dependency.location,
      );
      const resolved = load(dependencyId, true, dependency.location);
      edges.push({ from: id, to: resolved, location: dependency.location });
      return resolved;
    });
    modules[id] = { expressions, imports: analysis.imports, importIds };
    return id;
  }
  const root = load(entryId, false);
  const graph = finalizeModuleGraph(modules, root, edges);
  const javascriptExpressions = collectJavaScriptExpressions(
    graph.flatMap((module) => module.expressions),
  );
  const javascriptState = emitJavaScriptEvaluators(javascriptExpressions);
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
    "((javascriptEvaluators) => {",
    ...runtimePreludeLines(),
    experimentalEffectRuntime,
    experimentalEffectModuleRuntime,
    ...initializers,
    `try { runEffectProgram(effectInitialize(${root}, {file: "<entry>", line: 1, column: 1})); } catch (error) { reportEffectFailures(error); throw error; }`,
    `})(${javascriptState.source});`,
  ].join("\n");
}
