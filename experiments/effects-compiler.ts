// Experimental vertical slice. This compiler is not part of Toss's public API.
import type { Expression } from "../src/ast.ts";
import { experimentalEffectRuntime } from "./effects-runtime.ts";
import { expandProgram } from "../src/macro_compile.ts";
import {
  fileRootSetupLines,
  runtimePreludeLines,
} from "../src/codegen_prelude.ts";

function emit(expression: Expression, scope = "environment"): string {
  const context = `{location: ${
    JSON.stringify(expression.location)
  }, environment: ${scope}}`;
  switch (expression.kind) {
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
    case "block": {
      if (expression.asynchronous === true) {
        throw new Error(
          "Experimental effects compiler does not support async Blocks.",
        );
      }
      const parameters = expression.parameters.map((_, index) => `arg${index}`);
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
      return `(yield* effectSend(${emit(expression.receiver, scope)}, {name: ${
        JSON.stringify(expression.name)
      }, arguments: [${
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
        }, environment: ${scope}});`
      );
      return `(yield* (function*(extendTarget) {
if (extendTarget === null || typeof extendTarget !== "object" || Array.isArray(extendTarget) || isJavaScriptReference(extendTarget)) throw new TossRuntimeError("%extend target must be an Object.", ${context}.location);
${entries.join("\n")}
return extendTarget;
})(${emit(expression.input, scope)}))`;
    }
    case "await":
    case "import":
    case "javascriptImport":
    case "export":
    case "javascript":
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

export function compileExperimentalEffects(
  source: string,
  file: string,
): string {
  const expressions = expandProgram(source, { file });
  const body = expressions.map((expression) => `${emit(expression)};`).join(
    "\n",
  );
  return [
    "(() => {",
    ...runtimePreludeLines(),
    ...fileRootSetupLines(),
    experimentalEffectRuntime,
    'environment.bindings.set(Symbol.for("Effect"), effectRoot);',
    `try { runEffectProgram((function*() {\n${body}\n})()); } catch (error) { reportEffectFailures(error); throw error; }`,
    "})();",
  ].join("\n");
}
