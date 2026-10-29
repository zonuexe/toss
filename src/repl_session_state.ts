import type { Expression } from "./ast.ts";
import { generateFragment } from "./codegen.ts";
import { validateAsyncExpressions } from "./async_validation.ts";
import { type SourceLocation, TossSyntaxError } from "./diagnostic.ts";
import { expandProgram, LocalMacroRegistry } from "./macro_compile.ts";
import { createReplRuntime } from "./repl_runtime.ts";
import type {
  ReplMacroImportState,
  ReplModuleCandidate,
  ReplModuleState,
  ReplSessionHost,
} from "./repl_host.ts";
import {
  countLines,
  hostCause,
  readEvaluation,
  readInspection,
} from "./repl_session_helpers.ts";

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
  readonly macroImports: ReplMacroImportState;
  readonly moduleCandidate: ReplModuleCandidate;
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
  host: ReplSessionHost,
): ReplSessionState {
  const loader = options.loadJavaScriptModule ??
    ((specifier: string) => import(specifier));
  let macroImports = host.createMacroImportState(host.baseDirectory);
  let registry = new LocalMacroRegistry();
  let runtime: Runtime = createReplRuntime(host.writeOutput);
  let modules: ReplModuleState = host.createModuleState();
  let nextLine = 1;
  const hostNamespaces = new Map<string, unknown>();

  const reset = (): void => {
    registry = new LocalMacroRegistry();
    runtime = createReplRuntime(host.writeOutput);
    macroImports = host.createMacroImportState(macroImports.baseDirectory);
    modules = host.createModuleState();
  };

  const prepare = (source: string): Prepared => {
    const startLocation: SourceLocation = {
      file: "<repl>",
      line: nextLine,
      column: 1,
    };
    nextLine += countLines(source);
    const candidate = registry.copy();
    const sourceSnapshot = host.createSourceSnapshot?.();
    const candidateImports = macroImports.copy(sourceSnapshot);
    let expressions: readonly Expression[];
    let generated: string;
    let moduleCandidate: ReplModuleCandidate;
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
      moduleCandidate = host.compileModules(
        expressions,
        macroImports.baseDirectory,
        modules,
        sourceSnapshot,
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

function assertNever(value: never): never {
  throw new TypeError(`Unexpected REPL result: ${JSON.stringify(value)}`);
}
