import type { Expression } from "./ast.ts";
import { emitBlock } from "./codegen_block.ts";
import { TossSyntaxError } from "./diagnostic.ts";
import { containsDirectAwait } from "./codegen_analysis.ts";

export type ExpressionEmitter = (
  expression: Expression,
  scope?: string,
) => string;

export function createEmitter(
  evaluators?: ReadonlyMap<Expression, number>,
): ExpressionEmitter {
  const emit: ExpressionEmitter = (expression, scope = "environment") => {
    const context = `{location: ${
      JSON.stringify(expression.location)
    }, environment: ${scope}}`;
    switch (expression.kind) {
      case "block":
        return emitBlock(expression, scope, emit);
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
        return evaluators?.has(expression)
          ? `evaluateCompiledJavaScript(javascriptEvaluators[${
            evaluators.get(expression)
          }], [${
            expression.bindings.map((binding) => emit(binding.value, scope))
              .join(", ")
          }], ${context})`
          : `evaluateJavaScript(${JSON.stringify(expression.source)}, [${
            expression.bindings.map((binding) => emit(binding.value, scope))
              .join(", ")
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
          expression.arguments.map((argument) => emit(argument, scope)).join(
            ", ",
          )
        }]}, ${context})`;
      case "super":
        return `parentSend([${
          expression.arguments.map((argument) => emit(argument, scope)).join(
            ", ",
          )
        }], ${context}, ${scope})`;
      case "pipeline":
        return `pipelineSend(${emit(expression.input, scope)})(${
          emit(expression.receiver, scope)
        }, {name: ${JSON.stringify(expression.name)}, arguments: [${
          expression.arguments.map((argument) => emit(argument, scope)).join(
            ", ",
          )
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
          asynchronous
            ? "return {value: extendTarget};"
            : "return extendTarget;",
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
  };
  return emit;
}
