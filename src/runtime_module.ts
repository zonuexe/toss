import { runtimePreludeLines } from "./codegen_prelude.ts";

export const runtimeBridgeNames = [
  "TossRuntimeError",
  "awaitToss",
  "blockEnvironment",
  "evaluateCompiledJavaScript",
  "fetchBinding",
  "fromJavaScript",
  "isJavaScriptReference",
  "lexicalEnvironment",
  "markAsyncBlock",
  "parentSend",
  "pipelineSend",
  "send",
  "toJavaScript",
] as const;

export function runtimeBridgeSetupLines(): string[] {
  return [
    '"use strict";',
    `const {${runtimeBridgeNames.join(", ")}} = tossRuntime;`,
  ];
}

export function generateRuntimeModule(): string {
  return [
    "export function createRuntime() {",
    ...runtimePreludeLines(),
    `return {${runtimeBridgeNames.join(", ")}};`,
    "}",
    "",
  ].join("\n");
}
