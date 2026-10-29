import type { Expression } from "./ast.ts";
import type { SourceLocation } from "./diagnostic.ts";
import type { ResolvedMacroImport } from "./macro_compile.ts";

export type ReplModule = {
  readonly id: number;
  readonly canonical: string;
  readonly generated: string;
};

export type ReplModuleState = {
  readonly files: ReadonlyMap<string, ReplModule>;
  readonly nextId: number;
};

export type ReplModuleCandidate = {
  readonly state: ReplModuleState;
  readonly modules: readonly ReplModule[];
  readonly imports: readonly { readonly path: string; readonly id: number }[];
  readonly javascriptImports: readonly {
    readonly specifier: string;
    readonly location: SourceLocation;
  }[];
};

export type ReplMacroImportState = {
  readonly baseDirectory: string;
  readonly copy: (snapshot?: ReplSourceSnapshot) => ReplMacroImportState;
  readonly resolve: (
    source: string,
    file: string,
    startLocation: SourceLocation,
  ) => readonly ResolvedMacroImport[];
};

export type ReplSourceSnapshot = {
  readonly hasSources: boolean;
  readonly getSources: (
    location: SourceLocation,
    kind: "module" | "macro",
  ) => ReadonlyMap<string, string>;
};

export type ReplSessionHost = {
  readonly baseDirectory: string;
  readonly writeOutput?: (text: string) => void;
  readonly createMacroImportState: (
    baseDirectory: string,
  ) => ReplMacroImportState;
  readonly createSourceSnapshot?: () => ReplSourceSnapshot;
  readonly createModuleState: () => ReplModuleState;
  readonly compileModules: (
    expressions: readonly Expression[],
    baseDirectory: string,
    state: ReplModuleState,
    snapshot?: ReplSourceSnapshot,
  ) => ReplModuleCandidate;
};
