import type { SourceLocation } from "./diagnostic.ts";
import { moduleRuntimeLines } from "./codegen.ts";
import { fileRootSetupLines, runtimePreludeLines } from "./codegen_prelude.ts";

type RuntimeBridge = {
  readonly evaluate: (generated: string) => unknown;
  readonly inspect: (value: unknown, location: SourceLocation) => unknown;
  readonly registerModule: (id: number, generated: string) => void;
  readonly setJavaScriptImports: (
    imports: readonly (readonly [string, unknown])[],
  ) => void;
};

export function createReplRuntime(
  outputHandler?: (text: string) => void,
): RuntimeBridge {
  const bridgeSource = [
    ...runtimePreludeLines(
      true,
      undefined,
      outputHandler === undefined ? undefined : "replOutput",
    ),
    ...(outputHandler === undefined ? [] : [
      "function replOutput(text, location) { try { replOutputHandler(text); } catch (cause) { throw new TossRuntimeError('REPL output handler failed.', location, {cause}); } }",
    ]),
    ...fileRootSetupLines(),
    ...moduleRuntimeLines(),
    "const javascriptImportNames = new Map();",
    "return Object.freeze({",
    "evaluate(generated) { try { return {kind: 'value', value: eval(generated)}; } catch (error) { if (error instanceof TossRuntimeError) return {kind: 'runtimeError', message: runtimeDiagnostic(error)}; throw error; } },",
    "registerModule(id, generated) { moduleInitializers[id] = eval(generated); },",
    "setJavaScriptImports(imports) { javascriptImportNames.clear(); for (const [specifier, namespace] of imports) javascriptImportNames.set(specifier, namespace); },",
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
  const bridge: unknown = outputHandler === undefined
    ? Reflect.apply(Function(bridgeSource), undefined, [])
    : Reflect.apply(
      Function("replOutputHandler", bridgeSource),
      undefined,
      [outputHandler],
    );
  if (!isRuntimeBridge(bridge)) {
    throw new TypeError("Generated REPL runtime has an invalid bridge.");
  }
  return bridge;
}

function isRuntimeBridge(value: unknown): value is RuntimeBridge {
  if (typeof value !== "object" || value === null) return false;
  return typeof Reflect.get(value, "evaluate") === "function" &&
    typeof Reflect.get(value, "inspect") === "function" &&
    typeof Reflect.get(value, "registerModule") === "function" &&
    typeof Reflect.get(value, "setJavaScriptImports") === "function";
}
