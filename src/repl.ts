import type { Expression } from "./ast.ts";
import { generateFragment } from "./codegen.ts";
import { validateAsyncExpressions } from "./async_validation.ts";
import { type SourceLocation, TossSyntaxError } from "./diagnostic.ts";
import { expandProgram, LocalMacroRegistry } from "./macro_compile.ts";
import { createReplMacroImportState } from "./repl_macro_import.ts";
import { createReplRuntime } from "./repl_runtime.ts";
import { compileReplModules, type ReplModuleState } from "./repl_modules.ts";

type Evaluation =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "runtimeError"; readonly message: string };

type Inspection =
  | { readonly kind: "value"; readonly value: string }
  | { readonly kind: "runtimeError"; readonly message: string };

type Runtime = ReturnType<typeof createReplRuntime>;

export type ReplResult =
  | { readonly kind: "empty" }
  | { readonly kind: "value"; readonly display: string }
  | { readonly kind: "error"; readonly message: string };

export type ReplSession = {
  readonly submit: (source: string) => ReplResult;
  readonly reset: () => void;
};

export type ReplSessionOptions = {
  readonly baseDirectory?: string;
};

export function createReplSession(
  options: ReplSessionOptions = {},
): ReplSession {
  const startupDirectory = options.baseDirectory ?? Deno.cwd();
  let macroImports = createReplMacroImportState(startupDirectory);
  let registry = new LocalMacroRegistry();
  let runtime: Runtime = createReplRuntime();
  let modules: ReplModuleState = { files: new Map(), nextId: 0 };
  let nextLine = 1;

  const reset = (): void => {
    registry = new LocalMacroRegistry();
    runtime = createReplRuntime();
    macroImports = createReplMacroImportState(macroImports.baseDirectory);
    modules = { files: new Map(), nextId: 0 };
  };

  const submit = (source: string): ReplResult => {
    const startLocation: SourceLocation = {
      file: "<repl>",
      line: nextLine,
      column: 1,
    };
    nextLine += countLines(source);
    const candidate = registry.copy();
    const candidateImports = macroImports.copy();
    let expressions: readonly Expression[];
    let generated: string;
    let moduleCandidate: ReturnType<typeof compileReplModules>;
    try {
      const imports = candidateImports.resolve(source, "<repl>", startLocation);
      expressions = expandProgram(source, {
        file: "<repl>",
        imports,
        registry: candidate,
        startLocation,
        repl: true,
      });
      validateAsyncExpressions(expressions);
      moduleCandidate = compileReplModules(
        expressions,
        macroImports.baseDirectory,
        modules,
      );
      generated = generateFragment(expressions, moduleCandidate.imports);
    } catch (error) {
      if (error instanceof TossSyntaxError) {
        return { kind: "error", message: error.message };
      }
      throw error;
    }
    registry = candidate;
    macroImports = candidateImports;
    modules = moduleCandidate.state;
    for (const module of moduleCandidate.modules) {
      runtime.registerModule(module.id, module.generated);
    }
    const last = expressions.at(-1);
    if (last === undefined) return { kind: "empty" };
    const evaluated = readEvaluation(runtime.evaluate(generated));
    switch (evaluated.kind) {
      case "runtimeError":
        return { kind: "error", message: evaluated.message };
      case "value": {
        const inspected = readInspection(
          runtime.inspect(evaluated.value, last.location),
        );
        switch (inspected.kind) {
          case "runtimeError":
            return { kind: "error", message: inspected.message };
          case "value":
            return { kind: "value", display: inspected.value };
          default:
            return assertNever(inspected);
        }
      }
      default:
        return assertNever(evaluated);
    }
  };

  return Object.freeze({ submit, reset });
}

function countLines(source: string): number {
  const breaks = source.match(/\r\n|\r|\n/g)?.length ?? 0;
  return Math.max(1, breaks + (/[\r\n]$/.test(source) ? 0 : 1));
}

function readEvaluation(value: unknown): Evaluation {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(
      "Generated REPL evaluation returned an invalid result.",
    );
  }
  const kind = Reflect.get(value, "kind");
  const message = Reflect.get(value, "message");
  switch (kind) {
    case "runtimeError":
      if (typeof message === "string") return { kind, message };
      break;
    case "value":
      return { kind, value: Reflect.get(value, "value") };
    default:
      break;
  }
  throw new TypeError("Generated REPL evaluation returned an invalid result.");
}

function readInspection(value: unknown): Inspection {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(
      "Generated REPL inspection returned an invalid result.",
    );
  }
  const kind = Reflect.get(value, "kind");
  const message = Reflect.get(value, "message");
  switch (kind) {
    case "runtimeError":
      if (typeof message === "string") return { kind, message };
      break;
    case "value": {
      const display = Reflect.get(value, "value");
      if (typeof display === "string") return { kind, value: display };
      break;
    }
    default:
      break;
  }
  throw new TypeError("Generated REPL inspection returned an invalid result.");
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected REPL result: ${JSON.stringify(value)}`);
}
