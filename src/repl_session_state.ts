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

export type ReplSessionOptions = {
  readonly baseDirectory?: string;
  readonly loadJavaScriptModule?: (specifier: string) => Promise<unknown>;
};

type Candidate = {
  readonly kind: "candidate";
  readonly registry: LocalMacroRegistry;
  readonly macroImports: ReturnType<typeof createReplMacroImportState>;
  readonly moduleCandidate: ReturnType<typeof compileReplModules>;
  readonly expressions: readonly Expression[];
  readonly generated: string;
};

type Prepared = Candidate | Extract<ReplResult, { readonly kind: "error" }>;

export type ReplSessionState = {
  readonly prepare: (source: string) => Prepared;
  readonly commit: (
    candidate: Candidate,
    loaded: readonly (readonly [string, unknown])[],
  ) => void;
  readonly evaluate: (candidate: Candidate) => ReplResult;
  readonly load: (
    specifier: string,
    location: SourceLocation,
  ) => Promise<unknown>;
  readonly reset: () => void;
};

export function createReplSessionState(
  options: ReplSessionOptions,
): ReplSessionState {
  const startupDirectory = options.baseDirectory ?? Deno.cwd();
  const loader = options.loadJavaScriptModule ??
    ((specifier: string) => import(specifier));
  let macroImports = createReplMacroImportState(startupDirectory);
  let registry = new LocalMacroRegistry();
  let runtime: Runtime = createReplRuntime();
  let modules: ReplModuleState = { files: new Map(), nextId: 0 };
  let nextLine = 1;
  const hostNamespaces = new Map<string, unknown>();

  const reset = (): void => {
    registry = new LocalMacroRegistry();
    runtime = createReplRuntime();
    macroImports = createReplMacroImportState(macroImports.baseDirectory);
    modules = { files: new Map(), nextId: 0 };
  };

  const prepare = (source: string): Prepared => {
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
    return {
      kind: "candidate",
      registry: candidate,
      macroImports: candidateImports,
      moduleCandidate,
      expressions,
      generated,
    };
  };

  const load = async (
    specifier: string,
    location: SourceLocation,
  ): Promise<unknown> => {
    if (hostNamespaces.has(specifier)) {
      return hostNamespaces.get(specifier);
    }
    try {
      const namespace = await loader(specifier);
      hostNamespaces.set(specifier, namespace);
      return namespace;
    } catch (cause) {
      throw new TossSyntaxError(
        location,
        `Unable to load JavaScript module ${JSON.stringify(specifier)}: ${
          hostCause(cause)
        }.`,
      );
    }
  };

  const commit = (
    candidate: Candidate,
    loaded: readonly (readonly [string, unknown])[],
  ): void => {
    registry = candidate.registry;
    macroImports = candidate.macroImports;
    modules = candidate.moduleCandidate.state;
    for (const [specifier, namespace] of loaded) {
      hostNamespaces.set(specifier, namespace);
    }
    runtime.setJavaScriptImports([...hostNamespaces]);
    for (const module of candidate.moduleCandidate.modules) {
      runtime.registerModule(module.id, module.generated);
    }
  };

  const evaluate = (candidate: Candidate): ReplResult => {
    const last = candidate.expressions.at(-1);
    if (last === undefined) return { kind: "empty" };
    const evaluated = readEvaluation(runtime.evaluate(candidate.generated));
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

  return Object.freeze({ prepare, commit, evaluate, load, reset });
}

function hostCause(cause: unknown): string {
  if (typeof cause !== "object" || cause === null) {
    return primitiveCause(cause);
  }
  try {
    if (cause instanceof Error) {
      const message: unknown = Reflect.get(cause, "message");
      return typeof message === "string"
        ? message
        : "Error rejection without a string message";
    }
    return "non-Error object rejection";
  } catch (formattingFailure) {
    return primitiveCause(formattingFailure);
  }
}

function primitiveCause(cause: unknown): string {
  switch (typeof cause) {
    case "string":
      return cause;
    case "number":
    case "boolean":
    case "bigint":
    case "symbol":
    case "undefined":
      return String(cause);
    case "function":
    case "object":
      return "host rejection could not be formatted";
    default:
      return "unprintable host rejection";
  }
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
