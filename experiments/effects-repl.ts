// Isolated REPL output and cell-evaluation probe; not the public Toss REPL.
import {
  fileRootSetupLines,
  runtimePreludeLines,
} from "../src/codegen_prelude.ts";
import { compileExperimentalEffectsCell } from "./effects-compiler.ts";
import type { EffectDiagnosticHost } from "../src/effect_diagnostics.ts";
import { experimentalEffectRuntime } from "./effects-runtime.ts";

export function createExperimentalEffectsRepl(
  output: (text: string) => void,
  options: Partial<EffectDiagnosticHost> & {
    readonly failureCarriers?: boolean;
  } = {},
): {
  readonly evaluate: (source: string, file: string) => unknown;
} {
  const {
    onEffectFailure,
    onEffectObserverError,
    failureCarriers = onEffectFailure !== undefined,
  } = options;
  if (onEffectObserverError !== undefined && onEffectFailure === undefined) {
    throw new TypeError("An observer error hook requires a failure observer.");
  }
  if (onEffectFailure !== undefined && !failureCarriers) {
    throw new TypeError("A failure observer requires failure carriers.");
  }
  const code = [
    ...runtimePreludeLines(true, undefined, "replOutput"),
    "function replOutput(text, location) { try { outputHandler(text); } catch (cause) { throw new TossRuntimeError('REPL output handler failed.', location, {cause}); } }",
    ...fileRootSetupLines(),
    experimentalEffectRuntime({
      sharedDispatchTables: true,
      sharedBoundaryDelegate: true,
      outputHook: "replOutput",
      failureCarriers,
    }),
    'environment.bindings.set(Symbol.for("Effect"), effectRoot);',
    "environment.effectBoundary = getEffectBoundary(); registerEffectSymbolRoot(symbolRoot);",
    "return Object.freeze({ evaluate(generated, javascriptEvaluators) { try { return {kind: 'value', value: eval(generated)}; } catch (error) { const details = getEffectFailureDetails(error); return {kind: 'error', error: exposeEffectFailure(error, 'repl'), details}; } } });",
  ].join("\n");
  const bridge: unknown = Reflect.apply(
    Function("outputHandler", "effectDiagnosticHost", code),
    undefined,
    [
      output,
      onEffectFailure === undefined
        ? undefined
        : { onEffectFailure, onEffectObserverError },
    ],
  );
  if (
    typeof bridge !== "object" || bridge === null ||
    typeof Reflect.get(bridge, "evaluate") !== "function"
  ) {
    throw new TypeError("Experimental effect REPL has an invalid bridge.");
  }
  return {
    evaluate(source, file) {
      const cell = compileExperimentalEffectsCell(source, file);
      // Evaluators are created outside the runtime closure, as in AOT output.
      const evaluators: unknown = Reflect.apply(
        Function(`return ${cell.evaluators};`),
        undefined,
        [],
      );
      return Reflect.apply(Reflect.get(bridge, "evaluate"), bridge, [
        cell.body,
        evaluators,
      ]);
    },
  };
}
