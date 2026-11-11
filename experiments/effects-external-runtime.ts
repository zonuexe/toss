import { runtimePreludeLines } from "../src/codegen_prelude.ts";
import { fingerprintRuntimeSource } from "../src/runtime_module.ts";
import { experimentalEffectRuntime } from "./effects-runtime.ts";
import { experimentalEffectModuleRuntime } from "./effects-module-runtime.ts";

export type ExperimentalRuntimeOptions = {
  readonly sharedDispatchTables?: boolean;
  readonly directBoundarySteps?: boolean;
  readonly sharedBoundaryDelegate?: boolean;
};

const bridge = [
  "TossRuntimeError",
  "awaitToss",
  "blockEnvironment",
  "effectInitialize",
  "effectModuleInitializers",
  "effectParent",
  "effectPipeline",
  "effectRoot",
  "effectSend",
  "evaluateEffectJavaScript",
  "fetchBinding",
  "fromJavaScript",
  "getEffectBoundary",
  "isJavaScriptReference",
  "lexicalEnvironment",
  "markAsyncBlock",
  "markEffectBlock",
  "registerEffectSymbolRoot",
  "reportEffectFailures",
  "runEffectProgram",
  "send",
] as const;

function factory(options: ExperimentalRuntimeOptions): string {
  return [
    "export function createEffectRuntime() {",
    ...runtimePreludeLines(),
    experimentalEffectRuntime(
      options.sharedDispatchTables,
      options.directBoundarySteps,
      options.sharedBoundaryDelegate,
    ),
    experimentalEffectModuleRuntime,
    `return {${bridge.join(", ")}};`,
    "}",
  ].join("\n");
}

export function generateExperimentalEffectsRuntime(
  options: ExperimentalRuntimeOptions = {},
): string {
  const source = factory(options);
  return `export const runtimeFingerprint = ${
    JSON.stringify(fingerprintRuntimeSource(source))
  };\n${source}\n`;
}

export function experimentalRuntimeSetup(
  options: ExperimentalRuntimeOptions,
  namespace: string,
): string[] {
  const expected = fingerprintRuntimeSource(factory(options));
  const message = "Experimental effect runtime is missing or incompatible.";
  const functions = bridge.filter((name) =>
    name !== "effectRoot" && name !== "effectModuleInitializers"
  );
  return [
    `if (${namespace}.runtimeFingerprint !== ${
      JSON.stringify(expected)
    } || typeof ${namespace}.createEffectRuntime !== "function") throw new Error(${
      JSON.stringify(message)
    });`,
    "let experimentalRuntime;",
    `try { experimentalRuntime = ${namespace}.createEffectRuntime(); } catch (cause) { throw new Error(${
      JSON.stringify(message)
    }, {cause}); }`,
    `if (experimentalRuntime === null || typeof experimentalRuntime !== "object" || !${
      JSON.stringify(functions)
    }.every((name) => typeof experimentalRuntime[name] === "function") || experimentalRuntime.effectRoot === null || typeof experimentalRuntime.effectRoot !== "object" || !Array.isArray(experimentalRuntime.effectModuleInitializers)) throw new Error(${
      JSON.stringify(message)
    });`,
    `const {${bridge.join(", ")}} = experimentalRuntime;`,
  ];
}
