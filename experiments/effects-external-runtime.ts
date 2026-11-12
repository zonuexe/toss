import { runtimePreludeLines } from "../src/codegen_prelude.ts";
import { fingerprintRuntimeSource } from "../src/runtime_module.ts";
import {
  experimentalEffectRuntime,
  type ExperimentalRuntimeOptions,
} from "./effects-runtime.ts";
import { experimentalEffectModuleRuntime } from "./effects-module-runtime.ts";
type ExternalRuntimeOptions = Omit<ExperimentalRuntimeOptions, "outputHook">;

const bridge = [
  "TossRuntimeError",
  "awaitToss",
  "asEffectFailure",
  "blockEnvironment",
  "effectInitialize",
  "effectFailureValue",
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
  "throwAsyncEffectFailure",
] as const;

function factory(options: ExternalRuntimeOptions): string {
  return [
    "export function createEffectRuntime() {",
    ...runtimePreludeLines(),
    experimentalEffectRuntime(options),
    experimentalEffectModuleRuntime,
    `return {${bridge.join(", ")}};`,
    "}",
  ].join("\n");
}

export function generateExperimentalEffectsRuntime(
  options: ExternalRuntimeOptions = {},
): string {
  const source = factory(options);
  return `export const runtimeFingerprint = ${
    JSON.stringify(fingerprintRuntimeSource(source))
  };\n${source}\n`;
}

export function experimentalRuntimeSetup(
  options: ExternalRuntimeOptions,
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
