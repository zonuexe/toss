import type { SourceLocation } from "./diagnostic.ts";
import { fileRootSetupLines, runtimePreludeLines } from "./codegen_prelude.ts";

type RuntimeBridge = {
  readonly evaluate: (generated: string) => unknown;
  readonly inspect: (value: unknown, location: SourceLocation) => unknown;
};

export function createReplRuntime(): RuntimeBridge {
  const bridgeSource = [
    ...runtimePreludeLines(),
    ...fileRootSetupLines(),
    "return Object.freeze({",
    "evaluate(generated) { try { return {kind: 'value', value: eval(generated)}; } catch (error) { if (error instanceof TossRuntimeError) return {kind: 'runtimeError', message: runtimeDiagnostic(error)}; throw error; } },",
    "inspect(value, location) {",
    "const context = {location, environment};",
    "try { const result = send(value, {name: 'inspect', arguments: []}, context);",
    "if (typeof result !== 'string') throw new TossRuntimeError('inspect must return a string.', location);",
    "return {kind: 'value', value: result};",
    "} catch (error) { if (error instanceof TossRuntimeError) return {kind: 'runtimeError', message: runtimeDiagnostic(error)}; throw error; }",
    "},",
    "});",
    "function runtimeDiagnostic(error) {",
    "const cause = error.cause;",
    "return error.message + (cause instanceof Error ? '\\n  caused by: ' + cause.message : '');",
    "}",
  ].join("\n");
  const factory = Function(bridgeSource);
  const bridge: unknown = Reflect.apply(factory, undefined, []);
  if (!isRuntimeBridge(bridge)) {
    throw new TypeError("Generated REPL runtime has an invalid bridge.");
  }
  return bridge;
}

function isRuntimeBridge(value: unknown): value is RuntimeBridge {
  if (typeof value !== "object" || value === null) return false;
  return typeof Reflect.get(value, "evaluate") === "function" &&
    typeof Reflect.get(value, "inspect") === "function";
}
