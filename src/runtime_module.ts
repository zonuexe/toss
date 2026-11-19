import { runtimePreludeLines } from "./codegen_prelude.ts";

export const runtimeBridgeNames = [
  "TossRuntimeError",
  "awaitToss",
  "blockEnvironment",
  "checkEffectTask",
  "discardValueSend",
  "evaluateCompiledJavaScript",
  "fetchBinding",
  "finishEffectAsyncTask",
  "fromJavaScript",
  "hasEffectOwnedWork",
  "isJavaScriptReference",
  "joinEffectOwnedWork",
  "lexicalEnvironment",
  "markAsyncBlock",
  "ownedEffectRoot",
  "parentSend",
  "pipelineSend",
  "preserveOwnedAsyncRejection",
  "reportHostFailure",
  "resumeTossAwait",
  "send",
  "settleEffectTaskFailure",
  "toJavaScript",
] as const;

function runtimeFactorySource(): string {
  return [
    "export function createRuntime(effectDiagnosticHost) {",
    ...runtimePreludeLines(false, undefined, undefined, true, true),
    `return {${runtimeBridgeNames.join(", ")}};`,
    "}",
    "",
  ].join("\n");
}

export function fingerprintRuntimeSource(source: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function runtimeModuleFingerprint(): string {
  return fingerprintRuntimeSource(runtimeFactorySource());
}

export function runtimeCompatibilitySetupLines(
  namespace: string,
  expectedFingerprint = runtimeModuleFingerprint(),
  diagnosticHost = "undefined",
): string[] {
  const diagnostic =
    "Toss runtime is missing or incompatible. Regenerate the runtime module with the matching compiler, then rebuild this artifact.";
  const requiredHelpers = JSON.stringify(
    runtimeBridgeNames.filter((name) => name !== "ownedEffectRoot"),
  );
  return [
    '"use strict";',
    `if (${namespace}.runtimeFingerprint !== ${
      JSON.stringify(expectedFingerprint)
    } || typeof ${namespace}.createRuntime !== "function") {`,
    `throw new Error(${JSON.stringify(diagnostic)});`,
    "}",
    "let tossRuntime;",
    `try { tossRuntime = ${namespace}.createRuntime(${diagnosticHost}); } catch (cause) { throw new Error(${
      JSON.stringify(diagnostic)
    }, {cause}); }`,
    `if (tossRuntime === null || typeof tossRuntime !== "object" || tossRuntime.ownedEffectRoot === null || typeof tossRuntime.ownedEffectRoot !== "object" || !${requiredHelpers}.every((name) => typeof tossRuntime[name] === "function")) {`,
    `throw new Error(${JSON.stringify(diagnostic)});`,
    "}",
    `const {${runtimeBridgeNames.join(", ")}} = tossRuntime;`,
  ];
}

export function generateRuntimeModule(): string {
  return `export const runtimeFingerprint = ${
    JSON.stringify(
      runtimeModuleFingerprint(),
    )
  };\n${runtimeFactorySource()}`;
}
